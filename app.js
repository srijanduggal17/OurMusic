/** 
 *  @fileOverview	This file is for an express server to create playlists of songs that two users on Spotify have in common.
 *
 *  @author 		Srijan Duggal
 *
 *  @requires NPM:express
 *  @requires NPM:querystring
 *  @requires NPM:cookie-parser
 *  @requires NPM:body-parser
 *  @requires NPM:request-promise
 *  @requires NPM:firebase
 */

const express = require('express');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const rp = require('request-promise');

/** @global */
const stateKey = '__session';
const app = express();

const client_id = '';
const client_secret = '';
const redirect_uri = '';

const firebase = require('firebase');
const config = {
	apiKey: '',
	authDomain: '',
	databaseURL: '',
	projectId: '',
	storageBucket: '',
	messagingSenderId: ''
};
firebase.initializeApp(config);
const database = firebase.database();

app.use(express.static(__dirname + '/public'))
	.use(cookieParser())
	.use(bodyParser.urlencoded({ extended: true }));

/** @global */
var scope = 'user-library-read playlist-modify-public playlist-modify-private';

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string.
 */
function generateRandomString(length) {
	var text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (let i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}


/**
 * Directs user to Spotify's login page
 * @param  {Object} req - Request from login button
 * @param  {Object} res - Response to client
 * @return {undefined}
 */
function requestAuthorization(req, res) {
	const state = generateRandomString(16);
	var cookieObj = {
		state: state,
		redir: 'http://localhost:8889/callback/'
	};
	res.cookie(stateKey, JSON.stringify(cookieObj));

	const queryParams = querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: redirect_uri,
		state: state,
		show_dialog: true
	});

	res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
}

app.get('/login', requestAuthorization);


/**
 * Directs user to Spotify's login page with friend's data encoded
 * @param  {Object} req - Request from friend login button
 * @param  {Object} res - Response to client
 * @return {undefined}
 */
function requestAuthForFriend(req, res) {
	const state = generateRandomString(16);
	var cookieObj = {
		state: state,
		playlistName: req.body.playlistName,
		databaseRef: req.body.databaseRef,
		redir: 'http://localhost:8889/finish/'
	};
	res.cookie(stateKey, JSON.stringify(cookieObj));

	const queryParams = querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: 'http://localhost:8889/finish/',
		state: state,
		show_dialog: true
	});

	res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
}

app.post('/friendlogin', requestAuthForFriend);

/**
 * Gets access and refresh tokens
 * @param  {Object} req - Request from Spotify redirect
 * @param  {Object} res - Response to client
 * @return {Promise} Promise object representing request for access and refresh 
 * 	   tokens. Resolves with an array containing the two.
 */
function getTokens(req, res) {
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? JSON.parse(req.cookies[stateKey]) : null;
	var uri = storedState.redir;
	storedState = storedState.state;

	if (req.query.error) {
		res.redirect('/index.html');
	}

	if (state === null || state !== storedState) {
		res.send('Internal Server Error');
		throw new Error('state does not match storedState');
	}
	else {
		res.clearCookie(stateKey);
		const bodyParams = {
			method: 'POST',
			url: 'https://accounts.spotify.com/api/token',
			form: {
				code: code,
				redirect_uri: uri,
				grant_type: 'authorization_code'
			},
			headers: {
				'Authorization': 'Basic ' + (new Buffer(`${client_id}:${client_secret}`).toString('base64'))
			},
			json: true
		};

		return rp(bodyParams)
			.then(body => [body.access_token, body.refresh_token]);
	}
}

/**
 * Gets the total number of saved tracks a user has
 * @param  {string} token - Access token
 * @return {Promise} Promise object representing request to get total saved 
 * 	   track count. Resolves with an object containing the total count and the 
 * 	   access token.
 */
function getTotalSavedTracks(token) {
	const bodyParams = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => {
			return {
				totalSongs: body.total,
				token: token
			};
		});
}

/**
 * Gets 50 track objects
 * @param  {string} token - Access token
 * @param  {string} queryParams - Query parameters including offset and limit
 * @return {Promise} Promise object representing request for 50 track objects. 
 * 	   Resolves with array of track objects.
 */
function trackObjectRequest(token, queryParams) {
	const bodyParams = {
		method: 'GET',
		url: `https://api.spotify.com/v1/me/tracks?${queryParams}`,
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => body.items.map(x => x.track));
}

/**
 * Calls a request function many times until all data is collected
 * @param  {Function} requester - Function to be repeatedly called
 * @param  {string} token - Access token
 * @param  {number} total - Total number limiting the number of times the 
 * 	   function is called
 * @param  {string} [other] - Extra parameter if requester function needs it
 * @return {Object} Contains array of promises and array of objects.
 */
function loopingRequest(requester, token, total, other) {
	var objArray = [];
	var promiseArr = [];

	var prevOffset = -50;
	const numTimes = Math.ceil(total/50);

	for (let i = 0; i < numTimes; i++) {
		let paramObj = {
			limit: 50,
			offset: prevOffset + 50
		}; 
		let queryParams = querystring.stringify(paramObj);
		prevOffset = paramObj.offset;

		let currentPromise = requester(token, queryParams, other)
			.then(arr => objArray.push(...arr));

		promiseArr.push(currentPromise);
	}

	return {
		promiseArray: promiseArr,
		objectArray: objArray
	};
}

/**
 * Gets all saved track objects
 * @param  {Object} inObj - Contains necessary data to get saved tracks
 * @param {string} inObj.token - Access token
 * @param {number} inObj.totalSongs - Total number of saved tracks
 * @return {Promise} Promise object representing request to get all saved
 * 	   tracks. Resolves with array of track objects.
 */
function getSavedTrackObjects(inObj) {
	var outObj = loopingRequest(trackObjectRequest, inObj.token, inObj.totalSongs);

	return Promise.all(outObj.promiseArray)
		.then(() => outObj.objectArray);
}

/**
 * Gets the total number of playlists a user has
 * @param  {string} token - Access token
 * @param  {string} username - Username
 * @return {Promise} Promise object representing request to get total playlist
 * 	   count. Resolves with object containing total playlist count, username, 
 * 	   and access token.
 */
function getTotalPlaylists(token, username) {
	const bodyParams = {
		method: 'GET',
		url: `https://api.spotify.com/v1/${username}/playlists?`,
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => {
			return {
				totalPlaylists: body.total,
				username: username,
				token: token
			};
		});
}

/**
 * Gets the track info objects for 50 playlists
 * @param  {string} token - Access token
 * @param  {string} queryParams - Query parameters containing limit and offset 
 *     information
 * @param  {string} username - Username
 * @return {Promise} Promise object representing request for 50 playlist 
 * 	   objects. Resolves with array of track info objects.
 */
function trackInfoFromPlaylistRequest(token, queryParams, username) {
	const bodyParams = {
		method: 'GET',
		url: `https://api.spotify.com/v1/${username}/playlists?${queryParams}`,
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => body.items.map(x => x.tracks));
}

/**
 * Gets all the track info objects of a user. Track info objects contain the 
 *     playlist URL and the total number of tracks in the playlist
 * @param  {Object} inObj - Contains necessary data to get all playlist objects
 * @param {number} inObj.totalPlaylists - Total number of playlists the user has
 * @param {string} inObj.token - User's access token
 * @param {string} inObj.username - Username of user 
 * @return {Promise} Promise object representing request to get all playlist 
 * 	   objects. Resolves with object containing access token and array of 
 * 	   playlist objects.
 */
function getTrackInfoFromPlaylists(inObj) {
	var outObj = loopingRequest(trackInfoFromPlaylistRequest, inObj.token, inObj.totalPlaylists, inObj.username);

	return Promise.all(outObj.promiseArray)
		.then(() => {
			return {
				token: inObj.token,
				data: outObj.objectArray
			};
		});
}

/**
 * Gets 50 playlist track objects
 * @param  {string} token - Access token
 * @param  {string} queryParams - Query parameters, including offset and limit
 * @param  {string} href - Full playlist endpoint
 * @return {Promise} Promise object representing request for 50 track objects.
 * 	   Resolves with array of track objects.
 */
function trackObjectFromPlaylistRequest(token, queryParams, href) {
	const bodyParams = {
		method: 'GET',
		url: `${href}?${queryParams}`,
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => body.items.map(x => x.track));
}

/**
 * Gets all track objects from a playlist
 * @param  {Object} inObj - Contains necessary data to get all track ids from a
 * 	   playlist
 * @param {string} inObj.token - Access token
 * @param {number} inObj.totalPlaylistTracks - Total number of tracks contained 
 * 	   by a playlist
 * @param {string} inObj.playlistId - Playlist id
 * @return {Promise} Promise object representing request to get all track ids 
 * 	   from a playlist. Resolves with array of track ids.
 */
function getTrackObjectsFromPlaylist(inObj) {
	var outObj = loopingRequest(trackObjectFromPlaylistRequest, inObj.token, inObj.totalPlaylistTracks, inObj.playlistId);

	return Promise.all(outObj.promiseArray)
		.then(() => outObj.objectArray);
}

/**
 * Gets all track objects from all playlists
 * @param  {Object} inObj - Contains necessary data to get all track objects
 * 	   from playlists
 * @param {string} inObj.token - Access token
 * @param {Array<string>} inObj.data - Array of playlist objects
 * @return {Promise} Promise object representing request to get all track
 *     objects. Resolves with array of track objects.
 */
function getAllTrackObjectsFromPlaylists(inObj) {
	var data = inObj.data;

	var objArray = [];
	var promiseArr = [];

	for (let i = 0; i < data.length; i++) {
		let obj = {
			token: inObj.token,
			totalPlaylistTracks: data[i].total,
			playlistId: data[i].href
		};

		let currentPromise = getTrackObjectsFromPlaylist(obj)
			.then(arr => objArray.push(...arr));

		promiseArr.push(currentPromise);
	}

	return Promise.all(promiseArr)
		.then(() => objArray);
}

/**
 * Gets a user's track objects from both saved tracks and playlists
 * @param  {Array<string>} toks - Contains access and refresh tokens 
 * @return {Promise} Promise object representing request to get a user's saved
 * 	   and playlist tracks. Resolves with object containing data and access token.
 */
function getMyData (toks) {
	var savedTracksPromise = getTotalSavedTracks(toks[0])
		.then(getSavedTrackObjects);

	var playlistTracksPromise = getTotalPlaylists(toks[0], 'me')
		.then(getTrackInfoFromPlaylists)
		.then(getAllTrackObjectsFromPlaylists);

	return Promise.all([savedTracksPromise, playlistTracksPromise])
		.then(results => {
			var outArray = results[0].concat(results[1]);
			return {
				data: outArray,
				token: toks[0]
			};
		});
}

/**
 * Gets the unique Spotify ids of an array of track objects
 * @param  {Object} inObj - Contains data and access token
 * @return {Object} Contains a set with unique track ids and an access token 
 */
function getUniqueIds(inObj) {
	return {
		data: new Set(inObj.data.map(x => x.id)),
		token: inObj.token
	};
}

/**
 * Get's all of a user's Spotify track ids and pushes them to a database
 * @param  {object} req - Request after main user is logged in
 * @param  {object} res - Response to client
 * @return {undefined}
 */
function mainCallback(req, res) {
	var requestTokens = getTokens(req, res);

	var databaseKey;

	requestTokens
		.then(toks => {
			databaseKey = database.ref().push();
			databaseKey.child('tokens').set(toks);
			databaseKey.child('time').set(firebase.database.ServerValue.TIMESTAMP);
			var locationRef = databaseKey.toString();
			locationRef = locationRef.split('/');
			locationRef = locationRef[locationRef.length - 1];
			res.cookie(stateKey, locationRef);
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});

	requestTokens
		.then(getMyData)
		.then(getUniqueIds)
		.then(obj => {
			var arr = [...obj.data];

			databaseKey.child('myData')
				.set(arr)
				.then(() => {
					res.redirect('/friends.html');
				})
				.catch(error => {
					res.send('Internal Server Error');
					throw error;
				});
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

app.get('/callback', mainCallback);

/**
 * Gets Spotify track ids of songs shared by the main user and the friend
 * @param  {Object} inObj - Contains necessary data to get shared tracks
 * @param {string} inObj.databaseRef - Database endpoint to access main user's
 * 	   track ids
 * @param {Array<string>} inObj.friendData - Set containing track ids of friend
 * @param {string} inObj.friendInfo - Friend's username or access token
 * @param {string} inObj.playlistName - Name of playlist
 * @return {Promise} Promise object representing attempt to get shared tracks. 
 * 	   Resolves with object containing the shared tracks, the playlist name, the
 * 	   main user's access token, and either the friend's username or access token.
 */
function getCommonIds(inObj) {
	return new Promise((resolve, reject) => {
		var commonArray;

		database.ref(inObj.databaseRef)
			.once('value')
			.then(snapshot => {
				var myRawData = snapshot.val();
				var myData = myRawData.myData;

				commonArray = new Set(myData.filter(id => inObj.friendData.has(id)));

				var outObj = {
					data: commonArray,
					myToken: myRawData.tokens[0],
					friendInfo: inObj.friendInfo,
					playlistName: inObj.playlistName
				};
				resolve(outObj);
			})
			.catch(error => reject(error));
	});
}

/**
 * Gets the user id of the current user
 * @param  {string} token - Access token of current user
 * @return {Promise} Promise object representing request to access user data.
 * 	   Resolves with the user id.
 */
function getMyUserId(token) {
	const bodyParams = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => body.id);
}



/**
 * Creates a new empty playlist
 * @param  {string} name - Playlist name
 * @param  {string} userId - Main user's userId
 * @param  {string} token - Main user's access token
 * @param  {Array<string>} data - Set containing track ids 
 * @param  {boolean} isCollaborative - Whether the playlist is collaborative
 * @return {Promise} Promise object representing request to make playlist
 * 	   endpoint. Resolves with object containing an access token, the playlist 
 * 	   endpoint, the array of track ids, and the username.
 */
function createPlaylistEndpoint(name, userId, token, data, isCollaborative) {
	const requestBody = {
		name: name,
	};
	
	if (isCollaborative) {
		requestBody.public = false;
		requestBody.collaborative = true;
	}

	const bodyParams = {
		method: 'POST',
		form: JSON.stringify(requestBody),
		url: `https://api.spotify.com/v1/users/${userId}/playlists`,
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(bodyParams)
		.then(body => {
			return {
				token: token,
				playlistId: body.uri,
				data: data,
				userId: userId
			};
		});
}

/**
 * Creates an array of properly formatted Spotify track URIs to be added to a playlist
 * @param  {Array<string>} data - Set of track ids
 * @return {Array<string>} Array of Spotify track URIs.
 */
function reformat(data) {
	return [...data].map(x => `spotify:track:${x}`);
}

/**
 * Adds 50 tracks to a playlist
 * @param  {string} token - Main user's access token
 * @param  {string} userId - User id of main user
 * @param  {Array<strings>} tracks - Array containing Spotify track URIs
 * @param  {string} playlistId - Playlist endpoint
 * @return {Promise} Promise object representing request to add tracks to the 
 * 	   playlist. Resolves with response of request.
 */
function addTracksToPlaylist(token, userId, tracks, playlistId) {
	const bodyParams = {
		method: 'POST',
		form: JSON.stringify({uris: tracks}),
		url: `https://api.spotify.com/v1/users/${userId}/playlists/${playlistId}/tracks`,
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(bodyParams);
}

/**
 * Adds all songs to a playlist
 * @param {Object} inObj - Contains necessary data to add songs
 * @param {Array<string>} inObj.data - Set containing track ids to be added
 * @param {string} inObj.playlistId - Playlist endpoint
 * @param {string} inObj.token - Main user's access token
 * @param {string} inObj.userId - User id of main user
 * @return {Promise} Promise object representing request to add all songs.
 *     Resolves with playlist endpoint.
 */
function addAllTracksToPlaylist(inObj) {
	var data = inObj.data;
	var playlistId = inObj.playlistId;
	playlistId = playlistId.split(':');
	playlistId = playlistId[playlistId.length - 1];

	var totalSongs = data.size;

	data = reformat(data);

	var promiseArr = [];

	const numTimes = Math.ceil(totalSongs/100);

	for (let i = 0; i < numTimes; i++) {
		let startind = i*100;
		let endind = i*100 + 100;

		let currentSection = data.slice(startind, endind);

		let currentPromise = addTracksToPlaylist(inObj.token, inObj.userId, currentSection, playlistId);
		promiseArr.push(currentPromise);
	}

	return Promise.all(promiseArr)
		.then(() => inObj.playlistId);
}

/**
 * Creates a collaborative playlist under the main user's account
 * @param  {Object} inObj - Contains necessary data to create a collaborative playlist
 * @param {string} inObj.myToken - Main user's access token
 * @param {string} inObj.playlistName - Name of the playlist
 * @param {string} inObj.friendInfo - Friend's access token
 * @param {Array<string>} inObj.data - Set containing track ids
 * @return {Promise} Promise object representing creation of the playlist.
 * 	   Resolves with object containing the friend's access token, the user id of
 * 	   the main user, and the playlist endpoint.
 */
function createOurPlaylist(inObj) {
	return getMyUserId(inObj.myToken)
		.then(userId => {
			return createPlaylistEndpoint(inObj.playlistName, userId, inObj.myToken, inObj.data, true)
				.then(addAllTracksToPlaylist)
				.then(uri => {
					return {
						friendToken: inObj.friendInfo,
						ownerId: userId,
						playlistId: uri
					};
				});
		});
}

/**
 * Follows the main user's collaborative playlist from the friend's account
 * @param  {Object} inObj - Contains necessary data to follow a playlist
 * @param {string} inObj.playlistId - Endpoint for the collaborative playlist
 * @param {string} inObj.ownerId - Main user's id
 * @param {string} inObj.friendToken - Friend's access token 
 * @return {Promise} Promise object representing request to follow. 
 *     Resolves with playlist endpoint.
 */
function followPlaylist(inObj) {
	var playlistId = inObj.playlistId;
	playlistId = playlistId.split(':');
	playlistId = playlistId[playlistId.length - 1];

	const bodyParams = {
		method: 'PUT',
		url: `https://api.spotify.com/v1/users/${inObj.ownerId}/playlists/${playlistId}/followers`,
		headers: {
			'Authorization': `Bearer ${inObj.friendToken}`,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(bodyParams)
		.then(() => inObj.playlistId);
}

/**
 * Get's all of the friend's data, compares it to the main user's, and creates a
 *     collaborative playlist
 * @param  {Object} req - Request after friend is logged in
 * @param {Object} req.cookies - Cookie containing the state key encoded by the
 * 	   original request
 * @param  {Object} res - Response to client
 * @return {undefined}
 */
function friendMainCallback (req, res) {
	var cookieObj = req.cookies ? req.cookies[stateKey] : null;
	cookieObj = JSON.parse(cookieObj);
	var playlistName = cookieObj.playlistName;
	var databaseRef = cookieObj.databaseRef;

	getTokens(req, res)
		.then(getMyData)
		.then(getUniqueIds)
		.then(obj => {
			return {
				playlistName: playlistName,
				databaseRef: databaseRef,
				friendData: obj.data,
				friendInfo: obj.token
			};
		})
		.then(getCommonIds)
		.then(createOurPlaylist)
		.then(followPlaylist)
		.then(uri => {
			var outCookie = {
				databaseRef: databaseRef,
				uri: uri
			};
			res.cookie(stateKey, JSON.stringify(outCookie));
			res.redirect('/complete.html');
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

app.get('/finish', friendMainCallback);


/**
 * Gets all of the friend's songs from public playlists
 * @param  {string} toks - Main user's access tokens
 * @param  {string} friend - Friend's username
 * @return {Promise} Promise object representing attempt to get all of friend's 
 *     tracks. Resolves with object containing friend's public data and main 
 *     user's access token.
 */
function getFriendData(toks, friend) {
	const name = `users/${friend}`;
	return getTotalPlaylists(toks[0], name)
		.then(getTrackInfoFromPlaylists)
		.then(getAllTrackObjectsFromPlaylists)
		.then(arr => {
			return {
				data: arr,
				token: toks[0]
			};
		});
}

/**
 * Creates a playlist under the main user's account
 * @param  {Object} inObj - Contains necessary data to create a playlist
 * @param {string} inObj.myToken - Main user's access token
 * @param {string} inObj.playlistName - Name of playlist
 * @param {Array<string>} inObj.data - Set containing track ids both users share
 * @return {Promise} Promise object representing creation of the playlist. 
 *     Resolves with playlist endpoint.
 */
function createMyPlaylist(inObj) {
	return getMyUserId(inObj.myToken)
		.then(id => {
			return createPlaylistEndpoint(inObj.playlistName, id, inObj.myToken, inObj.data, false)
				.then(addAllTracksToPlaylist);
		});
}

/**
 * Get's the friend's public data, compares it to all of the main user's data, 
 *     and creates a playlist for the main user
 * @param  {Object} req - Request after friend's username is entered
 * @param {Object} req.body - Body of request
 * @param {string} req.body.username - Friend's username
 * @param {string} req.body.playlistName - Name of new playlist
 * @param {string} req.body.databaseRef - Unique endpoint for main user's access tokens
 * @param  {Object} res - Response to client
 * @return {undefined}
 */
function friendPublic(req, res) {
	const friendName = req.body.username;
	const playlistName = req.body.playlistName;
	const databaseRef = req.body.databaseRef;

	database.ref(`${databaseRef}/tokens`)
		.once('value')
		.then(data => {
			var toks = data.val();
			getFriendData(toks, friendName)
				.then(getUniqueIds)
				.then(inObj => {
					return {
						friendInfo: friendName,
						playlistName: playlistName,
						databaseRef: databaseRef,
						friendData: inObj.data
					};
				})
				.then(getCommonIds)
				.then(createMyPlaylist)
				.then(uri => {
					res.cookie(stateKey, uri);
					res.redirect('/complete.html');
				})
				.catch(error => {
					res.send('Internal Server Error');
					throw error;
				});
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

app.post('/friendpublic', friendPublic);


/**
 * Removes old data from the database
 * @param  {Object} req Request from cron-job scheduler
 * @param  {Object} res Response from server
 * @return {undefined}
 */
function cleanupFunc(req, res) {
	const difftime = 86400000;
	database.ref('/jobtime').set(admin.database.ServerValue.TIMESTAMP);

	database.ref()
		.once('value')
		.then(data => {
			const allData = data.val();
			const currenttime = allData.jobtime;

			for (const user in allData) {
				if (user != 'jobtime') {
					const posttime = allData[user]['time'];
					const diff = currenttime - posttime;
					if (diff > difftime) {
						database.ref(user).remove();
					}
				}
			}

			database.ref('/jobtime').remove();
			res.send('Complete');
		});
}

app.get('/cleanup', cleanupFunc);

app.listen(8889, () => {
	console.log('Listening on 8889');
});
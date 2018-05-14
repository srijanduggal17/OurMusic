const functions = require('firebase-functions');

var express = require('express'); 
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var rp = require('request-promise');

var stateKey = '__session';
var app = express();

var client_id = '15ec5ccbf8d648378ecefdf8bab3f58d'; // Your client id
var client_secret = 'a40cc81bc12a4ea0adcb04a8638bd1f2'; // Your secret
var redirect_uri = 'https://our-music-on-spotify.firebaseapp.com/callback/'; // Your redirect uri

const admin = require('firebase-admin');
const config = functions.config().firebase;
admin.initializeApp(config);
var database = admin.database();

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/login', postLogin);

function postLogin(req, res) {
	var state = generateRandomString(16);
	var cooks = {
		state: state,
		redir: 'https://our-music-on-spotify.firebaseapp.com/callback/'
	};
	res.setHeader('Cache-Control', 'private');
	res.cookie(stateKey, JSON.stringify(cooks));

	var scope = 'user-library-read playlist-modify-public playlist-modify-private';
	res.redirect('https://accounts.spotify.com/authorize?' +
	querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: redirect_uri,
		state: state,
		show_dialog: true
	}));
}

app.post('/friendlogin', friendLogin);

function friendLogin(req, res) {
	var state = generateRandomString(16);
	var cooks = {
		state: state,
		playname: req.body.playname,
		databaseref: req.body.databaseref,
		redir: 'https://our-music-on-spotify.firebaseapp.com/finish/'
	};

	res.setHeader('Cache-Control', 'private');
	res.cookie(stateKey, JSON.stringify(cooks));

	var scope = 'user-library-read playlist-modify-public playlist-modify-private';

	res.redirect('https://accounts.spotify.com/authorize?' +
	querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: 'https://our-music-on-spotify.firebaseapp.com/finish/',
		state: state,
		show_dialog: true
	}));
}

app.get('/finish', friendMainCallback);

function friendMainCallback (req, res) {
	var cooks = req.cookies ? req.cookies[stateKey] : null;
	cooks = JSON.parse(cooks);
	var playlistname = cooks.playname;
	var databaseref = cooks.databaseref;

	getInitialTokens(req, res)
		.then(getMyData)
		.then(combineArrays)
		.then(getUniqueIds)
		.then(obj => {
			return {
				playname: playlistname,
				databaseref: databaseref,
				frienddata: obj.data,
				friendinfo: obj.token
			};
		})
		.then(getCommonIds)
		.then(createOurPlaylist)
		.then(followPlaylist)
		.then(uri => {
			var outcookie = {
				databaseref: databaseref,
				uri: uri
			};
			res.cookie(stateKey, JSON.stringify(outcookie));
			res.redirect('/completion');
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

app.post('/friendpublic', secondCallback);

function secondCallback(req, res) {
	var friendname = req.body.username;
	var playname = req.body.playname;
	var databaseref = req.body.databaseref;

	database.ref(databaseref + '/tokens')
		.once('value')
		.then(data => {
			var toks = data.val();
			getFriendData(toks, friendname)
				.then(getUniqueIds)
				.then(inObj => {
					return {
						friendinfo: friendname,
						playname: playname,
						databaseref: databaseref,
						frienddata: inObj.data
					};
				})
				.then(getCommonIds)
				.then(createMyPlaylist)
				.then(uri => {
					var databaseref = req.cookies[stateKey];
					var outcookie = {
						databaseref: databaseref,
						uri: uri
					};
					res.cookie(stateKey, JSON.stringify(outcookie));
					res.redirect('/completion');
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

app.get('/completion', completionFunc);

function completionFunc(req, res) {
	var incookie = JSON.parse(req.cookies[stateKey]);
	database.ref(incookie.databaseref).remove()
		.then(() => {
			res.clearCookie(stateKey);
			res.cookie(stateKey, incookie.uri);
			res.redirect('complete.html');
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

function followPlaylist(inObj) {
	var playlistid = inObj.playlistid;
	playlistid = playlistid.split(':');
	playlistid = playlistid[playlistid.length - 1];
	
	var options = {
		method: 'PUT',
		url: 'https://api.spotify.com/v1/users/' + inObj.ownerid + '/playlists/' + playlistid + '/followers',
		headers: {
			'Authorization': 'Bearer ' + inObj.friendtoken,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(options)
		.then(() => inObj.playlistid);
}

function createMyPlaylist(inObj) {
	return getMyId(inObj.mytoken)
		.then(id => {
			return makeEndpoint(inObj.playname, id, inObj.mytoken, inObj.data, false)
				.then(addSongs);
		});
}

function createOurPlaylist(inObj) {
	return getMyId(inObj.mytoken)
		.then(id => {
			return makeEndpoint(inObj.playname, id, inObj.mytoken, inObj.data, true)
				.then(addSongs)
				.then(uri => {
					return {
						friendtoken: inObj.friendinfo,
						ownerid: id,
						playlistid: uri
					};
				});
		});
}

function getMyId(token) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me',
		headers: {
			'Authorization': 'Bearer ' + token
		},
		json: true
	};

	return rp(options)
		.then(body => body.id);
}

function makeEndpoint(name, username, token, data, collab) {
	var reqbod = {
		name: name,
	};

	if (collab) {
		reqbod.public = false;
		reqbod.collaborative = true;
	}

	var options = {
		method: 'POST',
		form: JSON.stringify(reqbod),
		url: 'https://api.spotify.com/v1/users/' + username + '/playlists',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(options)
		.then(body => {
			return {
				token: token,
				id: body.uri,
				data: data,
				userid: username
			};
		});
}

function addSongs(inObj) {
	var data = inObj.data;
	var playlistid = inObj.id;
	playlistid = playlistid.split(':');
	playlistid = playlistid[playlistid.length - 1];
	var token = inObj.token;
	var userid = inObj.userid;

	var totalsongs = data.size;

	data = cleanup(data);

	var promiseArr = [];

	var numtimes = Math.ceil(totalsongs/100);

	for (let i = 0; i < numtimes; i++) {
		let startind = i*100;
		let endind = i*100 + 100;
		let currentarr = data.slice(startind, endind);

		let currentprom = postTracks(token, userid, currentarr, playlistid);
		promiseArr.push(currentprom);
	}

	return Promise.all(promiseArr)
		.then(() => inObj.id);
}

function postTracks(token, userid, tracks, playlistid) {
	var options = {
		method: 'POST',
		form: JSON.stringify({uris: tracks}),
		url: 'https://api.spotify.com/v1/users/' + userid + '/playlists/' + playlistid + '/tracks',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return rp(options);
}

function cleanup(data) {
	return [...data].map(x => 'spotify:track:' + x);
}

function getCommonIds(inObj) {
	return new Promise((resolve, reject) => {
		var commonarr;
		var databaseref = inObj.databaseref;

		database.ref(databaseref)
			.once('value')
			.then(snapshot => {
				var myref = snapshot.val();
				var mydata = myref.mysongdata;

				commonarr = new Set(mydata.filter(id => inObj.frienddata.has(id)));

				var outObj = {
					data: commonarr,
					mytoken: myref.tokens[0],
					friendinfo: inObj.friendinfo,
					playname: inObj.playname
				};
				resolve(outObj);
			})
			.catch(error => reject(error));
	});
}

function getFriendData(toks, friend) {
	var name = 'users/' + friend;
	return getTotalPlaylists(toks[0], name)
		.then(getPlaylistObjects)
		.then(getTotalPlaylistTrackObjects)
		.then(arr => {
			return {
				data: arr,
				token: toks[0]
			};
		});
}

function getTotalPlaylists(token, username) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/' + username + '/playlists?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return rp(options)
		.then(body => {
			return {
				totalplaylists: body.total,
				username: username,
				token: token
			};
		});
}

function getPlaylistObjects(inObj) {
	var totalplaylists = inObj.totalplaylists;
	var token = inObj.token;
	var username = inObj.username;

	var outObj = loopingRequest(playlistObjectRequest, token, totalplaylists, username);

	return Promise.all(outObj.promisearray)
		.then(() => {
			return {
				token: token,
				data: outObj.objectarray
			};
		});
}

function playlistObjectRequest(token, params, username) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/' + username +'/playlists?' + params + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return rp(options)
		.then(body => body.items.map(x => x.tracks));
}

function getUniqueIds(inObj) {
	return {
		data: new Set(inObj.data.map(x => x.id)),
		token: inObj.token
	};
}

app.get('/callback', mainCallback);

function mainCallback(req, res) {
	var tokenrequest = getInitialTokens(req, res);

	var loc;

	tokenrequest
		.then(toks => {
			loc = database.ref().push();
			loc.child('tokens').set(toks);
			var locref = loc.toString();
			locref = locref.split('/');
			locref = locref[locref.length - 1];
			res.cookie(stateKey, locref);
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});

	tokenrequest
		.then(getMyData)
		.then(combineArrays)
		.then(getUniqueIds)
		.then(obj => {
			var arr = [...obj.data];

			loc.child('mysongdata')
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

function getMyData (toks) {
	var savedtrackspromise = getTotalSavedTracks(toks[0])
		.then(getSavedTrackObjects);

	var playlisttrackspromise = getTotalPlaylists(toks[0], 'me')
		.then(getPlaylistObjects)
		.then(getTotalPlaylistTrackObjects);

	return Promise.all([savedtrackspromise, playlisttrackspromise])
		.then(results => {
			return {
				data: results,
				token: toks[0]
			};
		});
}

function getTotalSavedTracks(token) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return rp(options)
		.then(body => {
			return {
				totalsongs: body.total,
				token: token
			};
		});
}

function getSavedTrackObjects(inObj) {
	var token = inObj.token;
	var totalnum = inObj.totalsongs;

	var outObj = loopingRequest(trackObjectRequest, token, totalnum);

	return Promise.all(outObj.promisearray)
		.then(() => outObj.objectarray);
}

function trackObjectRequest(token, params) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?' + params + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return rp(options)
		.then(body => body.items.map(x => x.track));
}

function getTotalPlaylistTrackObjects(inObj) {
	var token = inObj.token;
	var data = inObj.data;

	var objArray = [];
	var promiseArr = [];

	for (var i = 0; i < data.length; i++) {
		let obj = {
			token: token,
			totalplaylisttracks: data[i].total,
			id: data[i].href
		};

		let prom = getObjectsFromPlaylist(obj)
			.then(arr => objArray.push(...arr));

		promiseArr.push(prom);
	}

	return Promise.all(promiseArr)
		.then(() => objArray);
}

function getObjectsFromPlaylist(inObj) {
	var token = inObj.token;
	var totalplaylisttracks = inObj.totalplaylisttracks;
	var id = inObj.id;

	var outObj = loopingRequest(playlistTrackObjectRequest, token, totalplaylisttracks, id);

	return Promise.all(outObj.promisearray)
		.then(() => outObj.objectarray);
}

function playlistTrackObjectRequest(token, params, href) {
	var options = {
		method: 'GET',
		url: href + '?' + params,
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return rp(options)
		.then(body => body.items.map(x => x.track));
}

function combineArrays(arr) {
	var newarr = arr.data[0];
	newarr.push(...arr.data[1]);
	return {
		data: newarr,
		token: arr.token
	};
}

function getInitialTokens(req, res) {
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;
	storedState = JSON.parse(storedState);
	var uri = storedState.redir;
	storedState = storedState.state;

	if (state === null || state !== storedState) {
		res.send('Internal Server Error');
		throw new Error('state does not match storedState');
	}
	else {
		res.clearCookie(stateKey);
		let authOptions = {
			method: 'POST',
			url: 'https://accounts.spotify.com/api/token',
			form: {
				code: code,
				redirect_uri: uri,
				grant_type: 'authorization_code'
			},
			headers: {
				'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
			},
			json: true
		};

		return rp(authOptions)
			.then(body => [body.access_token, body.refresh_token]);
	}
}

app.listen(8889, () => {
	console.log('Listening on 8889');
});

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
function generateRandomString(length) {
	var text = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function loopingRequest(requester, token, total, other) {
	var objArray = [];
	var promiseArr = [];

	var prevoffset = -50;
	var numtimes = Math.ceil(total/50);

	for (let i = 0; i < numtimes; i++) {
		let paramobj = {
			limit: 50,
			offset: prevoffset + 50
		}; 
		let params = querystring.stringify(paramobj);
		prevoffset = paramobj.offset;

		let currentprom = requester(token, params, other)
			.then(arr => objArray.push(...arr));

		promiseArr.push(currentprom);
	}

	return {
		promisearray: promiseArr,
		objectarray: objArray
	};
}

exports.app = functions.https.onRequest(app);
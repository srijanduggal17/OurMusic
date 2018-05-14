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
	var playname = req.body.playname;
	var databaseref = req.body.databaseref;
	var state = generateRandomString(16);
	var cooks = {
		state: state,
		playname: playname,
		databaseref: databaseref,
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
			var outObj = {
				playlistname: playlistname,
				databaseref: databaseref,
				friend: obj
			};
			return outObj;
		})
		.then(getFullCommonIds)
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
		.once('value', data => {
			var toks = data.val();
			getFriendData(toks, friendname)
				.then(getUniqueIds)
				.then(inObj => {
					var outObj = {
						friendname: friendname,
						playname: playname,
						databaseref: databaseref,
						friend: inObj
					};

					return outObj;
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
				});
		});
}

app.get('/completion', completionFunc);

function completionFunc(req, res) {
	var incookie = req.cookies[stateKey];
	incookie = JSON.parse(incookie);
	var databaseref = incookie.databaseref;
	database.ref(databaseref).remove();
	res.clearCookie(stateKey);
	res.cookie(stateKey, incookie.uri);
	res.redirect('complete.html');
}

function followPlaylist(inObj) {
	var ownerid = inObj.ownerid;
	var playlistid = inObj.playlistid;
	playlistid = playlistid.split(':');
	playlistid = playlistid[playlistid.length - 1];
	
	var token = inObj.friendtoken;

	var options = {
		method: 'PUT',
		url: 'https://api.spotify.com/v1/users/' + ownerid + '/playlists/' + playlistid + '/followers',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type' : 'application/json'
		},
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(() => {
				resolve(inObj.playlistid);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function createMyPlaylist(inObj) {
	return new Promise ((resolve, reject) => {
		getMyId(inObj.mytoken)
			.then(id => {
				var data = inObj.data;
				var playlistname = inObj.playname || ('me and ' + inObj.friendname);
				makeEndpoint(playlistname, id, inObj.mytoken, data, false)
					.then(addSongs)
					.then(uri => {
						resolve(uri);
					});
			})
			.catch(error => {
				reject(error);
			});
	});
}

function createOurPlaylist(inObj) {
	return new Promise ((resolve, reject) => {
		getMyId(inObj.mytoken)
			.then(id => {
				var data = inObj.data;
				makeEndpoint(inObj.playlistname, id, inObj.mytoken, data, true)
					.then(addSongs)
					.then(uri => {
						var outObj = {
							friendtoken: inObj.friendtoken,
							ownerid: id,
							playlistid: uri
						};
						resolve(outObj);
					});
			})
			.catch(error => {
				reject(error);
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

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				resolve(body.id);
			})
			.catch(error => {
				reject(error);
			});
	});
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

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var outObj = {
					token: token,
					id: body.uri,
					data: data,
					userid: username
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
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

		let currentprom = new Promise((resolve, reject) => {
			postTracks(token, userid, currentarr, playlistid)
				.then(() => {
					resolve('resolved');
				})
				.catch(error => {
					reject(error);
				});
		});

		promiseArr.push(currentprom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				resolve(inObj.id);
			})
			.catch(error => {
				reject(error);
			});
	});
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

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(() => {
				resolve('success');
			})
			.catch(error => {
				reject(error);
			});
	});
}

function cleanup(data) {
	var arr = [...data];
	var newarr = arr.map(x => 'spotify:track:' + x);
	return newarr;
}

function getFullCommonIds(inObj) {
	return new Promise((resolve, reject) => {
		var commonarr;

		var databaseref = inObj.databaseref;

		database.ref(databaseref)
			.once('value', snapshot => {
				var myref = snapshot.val();
				var mydata = myref.mysongdata;

				commonarr = new Set(mydata.filter(id => inObj.friend.data.has(id)));

				var outObj = {
					data: commonarr,
					mytoken: myref.tokens[0],
					friendtoken: inObj.friend.token,
					playlistname: inObj.playlistname
				};
				resolve(outObj);
			});
	});
}

function getCommonIds(inObj) {
	return new Promise((resolve, reject) => {
		var commonarr;

		var databaseref = inObj.databaseref;

		database.ref(databaseref)
			.once('value', snapshot => {
				var myref = snapshot.val();
				var mydata = myref.mysongdata;

				commonarr = new Set(mydata.filter(id => inObj.friend.data.has(id)));

				var outObj = {
					data: commonarr,
					mytoken: myref.tokens[0],
					friendname: inObj.friendname,
					playname: inObj.playname
				};
				resolve(outObj);
			});
	});
}

function getFriendData(toks, friend) {
	return new Promise((resolve, reject) => {
		var name = 'users/' + friend;
		getTotalPlaylists(toks[0], name)
			.then(getPlaylistObjects)
			.then(getTotalPlaylistTrackObjects)
			.then(arr => {
				var outObj = {
					data: arr,
					token: toks[0]
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getTotalPlaylists(token, username) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/' + username + '/playlists?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var outObj = {
					totalplaylists: body.total,
					username: username,
					token: token
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getPlaylistObjects(inObj) {
	var totalplaylists = inObj.totalplaylists;
	var token = inObj.token;
	var username = inObj.username;

	var objArray = [];
	var promiseArr = [];

	var prevoffset = -50;
	var numtimes = Math.ceil(totalplaylists/50);

	for (let i = 0; i < numtimes; i++) {
		let paramobj = {
			limit: 50,
			offset: prevoffset + 50
		}; 
		let params = querystring.stringify(paramobj);
		prevoffset = paramobj.offset;

		let currentprom = new Promise((resolve, reject) => {
			playlistObjectRequest(token, params, username)
				.then(arr => {
					var playlistArr = [];
					for (let j = 0; j < arr.length; j++) {
						playlistArr.push(arr[j].tracks);
					}
					objArray.push(...playlistArr);
					resolve('resolved');
				})
				.catch(error => {
					reject(error);
				});
		});

		promiseArr.push(currentprom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				let outObj = {
					token: token,
					data: objArray
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function playlistObjectRequest(token, params, username) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/' + username +'/playlists?' + params + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var resultarr = body.items;
				resolve(resultarr);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getUniqueIds(inObj) {
	var arr = inObj.data;

	var mydataset = new Set();
	for (let i = 0; i < arr.length; i++) {
		mydataset.add(arr[i].id);
	}

	var outObj = {
		data: mydataset,
		token: inObj.token
	};
	return outObj;
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
		});

	tokenrequest
		.then(getMyData)
		.then(combineArrays)
		.then(getUniqueIds)
		.then(obj => {
			var arr = [...obj.data];

			loc.child('mysongdata')
				.set(arr, () => {
					res.redirect('/friends.html');
				});
		})
		.catch(error => {
			res.send('Internal Server Error');
			throw error;
		});
}

function getMyData (toks) {
	var savedtrackspromise = savedTracks(toks[0]);
	var playlisttrackspromise = playlistTracks(toks[0]);

	return new Promise((resolve, reject) => {
		Promise.all([savedtrackspromise, playlisttrackspromise])
			.then(results => {
				var outObj = {
					data: results,
					token: toks[0]
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function savedTracks(token) {
	return new Promise((resolve, reject) => {
		getTotalSavedTracks(token)
			.then(getSavedTrackObjects)
			.then(arr => {
				resolve(arr);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getTotalSavedTracks(token) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var outObj = {
					totalsongs: body.total,
					token: token
				};
				resolve(outObj);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getSavedTrackObjects(inObj) {
	var token = inObj.token;
	var totalnum = inObj.totalsongs;

	var objArray = [];
	var promiseArr = [];

	var prevoffset = -50;
	var numtimes = Math.ceil(totalnum/50);


	for (let i = 0; i < numtimes; i++) {
		let paramobj = {
			limit: 50,
			offset: prevoffset + 50
		}; 
		let params = querystring.stringify(paramobj);
		prevoffset = paramobj.offset;

		let currentprom = new Promise((resolve, reject) => {
			trackObjectRequest(token, params)
				.then(arr => {
					objArray.push(...arr);
					resolve('resolved');
				})
				.catch(error => {
					reject(error);
				});
		});

		promiseArr.push(currentprom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				resolve(objArray);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function trackObjectRequest(token, params) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?' + params + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var resultarr = body.items;
				var newarr = [];
				for (let i = 0; i < resultarr.length; i++) {
					newarr.push(resultarr[i].track);
				}
				resolve(newarr);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function playlistTracks(token) {
	return new Promise((resolve, reject) => {
		getTotalPlaylists(token, 'me')
			.then(getPlaylistObjects)
			.then(getTotalPlaylistTrackObjects)
			.then(arr => {
				resolve(arr);
			})
			.catch(error => {
				reject(error);
			});
	});
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

		let prom = new Promise((resolve, reject) => {
			getObjectsFromPlaylist(obj)
				.then(arr => {
					objArray.push(...arr);
					resolve('resolved');
				})
				.catch(error => {
					reject(error);
				});
		});

		promiseArr.push(prom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				resolve(objArray);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getObjectsFromPlaylist(inObj) {
	var token = inObj.token;
	var totalplaylisttracks = inObj.totalplaylisttracks;
	var id = inObj.id;

	var objArray = [];
	var promiseArr = [];

	var prevoffset = -50;
	var numtimes = Math.ceil(totalplaylisttracks/50);

	for (let i = 0; i < numtimes; i++) {
		let paramobj = {
			limit: 50,
			offset: prevoffset + 50
		}; 
		let params = querystring.stringify(paramobj);
		prevoffset = paramobj.offset;

		let currentprom = new Promise((resolve, reject) => {
			playlistTrackObjectRequest(token, params, id)
				.then(arr => {
					objArray.push(...arr);
					resolve('resolved');
				})
				.catch(error => {
					reject(error);
				});
		});

		promiseArr.push(currentprom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				resolve(objArray);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function playlistTrackObjectRequest(token, params, href) {
	var options = {
		method: 'GET',
		url: href + '?' + params,
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				var resultarr = body.items;
				var newarr = [];
				for (let i = 0; i < resultarr.length; i++) {
					newarr.push(resultarr[i].track);
				}
				resolve(newarr);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function combineArrays(arr) {
	var newarr = arr.data[0];
	newarr.push(...arr.data[1]);
	var outObj = {
		data: newarr,
		token: arr.token
	};
	return outObj;
}

function getInitialTokens(req, res) {
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;
	storedState = JSON.parse(storedState);
	var uri = storedState.redir;
	storedState = storedState.state;

	if (state === null || state !== storedState) {
		res.redirect('/#' +
			querystring.stringify({
				error: 'state_mismatch'
			}));
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

		return new Promise ((resolve, reject) => {
			rp(authOptions)
				.then(body => {
					var access_token = body.access_token,
						refresh_token = body.refresh_token;

					var toks = [access_token, refresh_token];
					
					resolve(toks);
				})
				.catch(error => {
					reject(error);
				});
		});
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
var generateRandomString = function(length) {
	var text = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
};

exports.app = functions.https.onRequest(app);
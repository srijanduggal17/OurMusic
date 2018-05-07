var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var rp = require('request-promise');

var stateKey = '__session';
var app = express();

var client_id = '15ec5ccbf8d648378ecefdf8bab3f58d'; // Your client id
var client_secret = 'a40cc81bc12a4ea0adcb04a8638bd1f2'; // Your secret
var redirect_uri = 'http://localhost:8889/callback/'; // Your redirect uri

var trackobjectsarr = [];
var mysongsarr = [];
var myplaylistobjarr = [];

var firebase = require("firebase");
var config = {
	apiKey: "AIzaSyCz4s7QchGpEoqEbXsHCrlZYcnkIcdFD08",
	authDomain: "our-music-on-spotify.firebaseapp.com",
	databaseURL: "https://our-music-on-spotify.firebaseio.com",
	projectId: "our-music-on-spotify",
	storageBucket: "our-music-on-spotify.appspot.com",
	messagingSenderId: "1134077370"
};
firebase.initializeApp(config);
var database = firebase.database();

app.use(express.static(__dirname + '/public'))
	.use(cookieParser())
	.use(bodyParser.urlencoded({ extended: true }));

app.get('/login', postLogin);

function postLogin(req, res) {
	console.log("postLogin");
	var state = generateRandomString(16);
	res.cookie(stateKey, state);

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

	console.log("friendLogin");
	var state = generateRandomString(16);
	var cooks = {
		state: state,
		playname: playname,
		databaseref: databaseref
	};
	res.cookie(stateKey, JSON.stringify(cooks));

	var scope = 'user-library-read playlist-modify-public playlist-modify-private';

	res.redirect('https://accounts.spotify.com/authorize?' +
	querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: 'http://localhost:8889/finish/',
		state: state,
		show_dialog: true
	}));
}

app.get('/finish', friendMainCallback);

function friendMainCallback (req, res) {
	console.log("friendMainCallback");

	var cooks = req.cookies ? req.cookies[stateKey] : null;
	cooks = JSON.parse(cooks);
	var playlistname = cooks.playname;
	var databaseref = cooks.databaseref;

	getFriendInitialTokens(req, res)
	.then(getMyData)
	.then(combineArrays)
	.then(getUniqueIds)
	.then(obj => {
		console.log("done");
		console.log(obj.data);
		console.log(obj.data.size);

		friendsongscomplete = obj;

		var outObj = {
			playlistname: playlistname,
			databaseref: databaseref
		};
		return outObj;
	})
	.then(getFullCommonIds)
	.then(createPlaylists)
	.then(() => {
		res.redirect("postcreation.html");
	})
	.catch(error => {
		console.error("Error somewhere in main callback");
		console.log(error);
	});
}

app.post('/friendpublic', secondCallback)

var friendsongscomplete;

function secondCallback(req, res) {
	console.log("secondCallback");

	var friendname = req.body.username;
	var playname = req.body.playname;
	var databaseref = req.body.databaseref;

	database.ref(databaseref + '/tokens')
	.on('value', data => {
		var toks = data.val();

		if (toks) {
			getFriendData(toks, friendname)
			.then(getUniqueIds)
			.then(inObj => {
				friendsongscomplete = inObj;

				var outObj = {
					friendname: friendname,
					playname: playname,
					databaseref: databaseref
				}

				return outObj;
			})
			.then(getCommonIds)
			.then(createMyPlaylist)
			.then(() => {
				res.clearCookie(stateKey);
				res.redirect("postcreation.html");
			});
		}
	});
}

function createPlaylists(inObj) {
	createOurPlaylist(inObj)
	.then(followPlaylist);
}

function followPlaylist(inObj) {
	console.log("followPlaylist");
	var ownerid = inObj.ownerid;
	var playlistid = inObj.playlistid;
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
			.then(body => {
				resolve("success");
			})
			.catch(error => {
				console.error("Error in postTracks");
				reject(error);
			});
	});
}

function createMyPlaylist(inObj) {
	getMyId(inObj.mytoken)
	.then(id => {
		var data = inObj.data;
		var playlistname = inObj.playname || ("me and " + inObj.friendname);
		makeEndpoint(playlistname, id, inObj.mytoken, data, false)
		.then(addSongs)
		.then(blah => {
			console.log("everything done");
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
			.then(playid => {
				var outObj = {
					friendtoken: inObj.friendtoken,
					ownerid: id,
					playlistid: playid
				}
				console.log("ourPlaylist created");
				resolve(outObj);
			});
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
				console.error("Error in makeEndpoint");
				reject(error);
			});
	});
}

function makeEndpoint(name, username, token, data, collab) {
	console.log("makeEndpoint");

	var reqbod = {
		name: name,
	}
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
					id: body.id,
					data: data,
					userid: username
				};
				resolve(outObj);
			})
			.catch(error => {
				console.error("Error in makeEndpoint");
				reject(error);
			});
	});
}

function addSongs(inObj) {
	console.log("addSongs");

	var data = inObj.data;
	var playlistid = inObj.id;
	var token = inObj.token;
	var userid = inObj.userid;

	var totalsongs = data.size;

	data = cleanup(data);

	var promiseArr = [];

	var prevoffset = -100;
	var numtimes = Math.ceil(totalsongs/100);

	for (let i = 0; i < numtimes; i++) {
		let startind = i*100;
		let endind = i*100 + 100;

		let currentarr = data.slice(startind, endind);

		currentprom = new Promise((resolve, reject) => {
			postTracks(token, userid, currentarr, playlistid)
			.then(arr => {
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of addSongs");
				reject(error);
			});
		});

		promiseArr.push(currentprom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
			.then(() => {
				resolve(playlistid);
			})
			.catch(error => {
				console.error("Error in addSongs");
				reject(error);
			});
	});
}

function postTracks(token, userid, tracks, playlistid) {
	console.log("postTracks");
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
			.then(body => {
				resolve("success");
			})
			.catch(error => {
				console.error("Error in postTracks");
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
		.on("value", snapshot => {
			var myref = snapshot.val();
			var mydata = myref.mysongdata;

			console.log(mydata);

			commonarr = new Set(mydata.filter(id => friendsongscomplete.data.has(id)));

			var outObj = {
				data: commonarr,
				mytoken: myref.tokens[0],
				friendtoken: friendsongscomplete.token,
				playlistname: inObj.playlistname
			}
			resolve(outObj);
		});
	})
}

function getCommonIds(inObj) {
	return new Promise((resolve, reject) => {
		var commonarr;

		var databaseref = inObj.databaseref;
		console.log(databaseref);

		database.ref(databaseref)
		.on("value", snapshot => {
			var myref = snapshot.val();
			var mydata = myref.mysongdata;

			commonarr = new Set(mydata.filter(id => friendsongscomplete.data.has(id)));

			var outObj = {
				data: commonarr,
				mytoken: myref.tokens[0],
				friendname: inObj.friendname,
				playname: inObj.playname
			}
			resolve(outObj);
		})
	})
}

function getFriendData(toks, friend) {
	console.log("getFriendData");
	return new Promise((resolve, reject) => {
		var name = 'users/' + friend;
		getTotalPlaylists(toks[0], name)
		.then(getPlaylistObjects)
		.then(getTotalPlaylistTrackObjects)
		.then(arr => {
			var outObj = {
				data: arr,
				token: toks[0]
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in playlistTracks");
			reject(error);
		});
	})
}

function getTotalPlaylists(token, username) {
	console.log("getFriendTotalPlaylists");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/' + username + '/playlists?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
		.then(body => {
			console.log('Total friend playlists received');
			var outObj = {
				totalplaylists: body.total,
				username: username,
				token: token
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in getFriendTotalPlaylists");
			reject(error);
		});
	});
}

function getPlaylistObjects(inObj) {
	console.log("getFriendPlaylistObjects");
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

		currentprom = new Promise((resolve, reject) => {
			playlistObjectRequest(token, params, username)
			.then(arr => {
				var playlistArr = [];
				for (let j = 0; j < arr.length; j++) {
					playlistArr.push(arr[j].tracks);
				}
				objArray.push(...playlistArr);
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of getFriendPlaylistObjects");
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
				}
				resolve(outObj);
			})
			.catch(error => {
				console.error("Error in getFriendPlaylistObjects");
				reject(error);
			});
	});
}

function playlistObjectRequest(token, params, username) {
	console.log("friendPlaylistObjectRequest");
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
				console.error("Error in playlistObjectRequest");
				reject(error);
			});
	});
}

function getUniqueIds(inObj) {
	console.log("getUniqueIds");
	var arr = inObj.data;

	var mydataset = new Set();
	for (let i = 0; i < arr.length; i++) {
		mydataset.add(arr[i].id);
	}

	var outObj = {
		data: mydataset,
		token: inObj.token
	}
	return outObj;
}

app.get('/callback', mainCallback);

function mainCallback(req, res) {
	console.log("mainCallback");

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
		console.log("done");
		// console.log(obj.data);
		console.log(obj.data.size);

		var arr = [...obj.data];

		loc.child('mysongdata')
		.set(arr, () => {
			res.redirect('/friends.html');
		});
	})
	.catch(error => {
		console.error("Error somewhere in main callback");
		console.log(error);
	});
}

function getInitialTokens(req, res) {
	console.log("getInitialTokens");
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;

	if (state === null || state !== storedState) {
		throw new Error("state does not match storedState");
		res.redirect('/#' +
			querystring.stringify({
				error: 'state_mismatch'
			}));
	} else {
		res.clearCookie(stateKey);
		let authOptions = {
			method: 'POST',
			url: 'https://accounts.spotify.com/api/token',
			form: {
				code: code,
				redirect_uri: redirect_uri,
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

				// res.redirect('/#' +
				// 	querystring.stringify({
				// 		access_token: access_token,
				// 		refresh_token: refresh_token
				// 	}));
				var toks = [access_token, refresh_token];
				
				resolve(toks);
			})
			.catch(error => {
				console.error("Error obtaining access token from refresh token");

				res.redirect('/#' +
					querystring.stringify({
						error: 'invalid_token'
					}));
				reject(error);
			});
		});
	}
}

function getMyData (toks) {
	console.log("getMyData");
	var savedtrackspromise = savedTracks(toks[0]);
	var playlisttrackspromise = playlistTracks(toks[0]);

	return new Promise((resolve, reject) => {
		Promise.all([savedtrackspromise, playlisttrackspromise])
		.then(results => {
			console.log("yay we done");
			var outObj = {
				data: results,
				token: toks[0]
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in getMyData");
			resolve(error);
		})
	});
}

function savedTracks(token) {
	console.log("savedTracks");
	return new Promise((resolve, reject) => {
		getTotalSavedTracks(token)
		.then(getSavedTrackObjects)
		.then(arr => {
			resolve(arr);
		})
		.catch(error => {
			console.error("Error in savedTracks");
			reject(error);
		})
	})
}

function getTotalSavedTracks(token) {
	console.log("getTotalSavedTracks");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
		.then(body => {
			console.log('Total saved tracks received');
			var outObj = {
				totalsongs: body.total,
				token: token
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in getTotalSavedTracks");
			reject(error);
		});
	});
}

function getSavedTrackObjects(inObj) {
	console.log("getSavedTrackObjects");
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

		currentprom = new Promise((resolve, reject) => {
			trackObjectRequest(token, params)
			.then(arr => {
				objArray.push(...arr);
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of getSavedTrackObjects");
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
				console.error("Error in getSavedTrackObjects");
				reject(error);
			});
	});
}

function trackObjectRequest(token, params) {
	console.log("trackObjectRequest");
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
				console.error("Error in trackObjectRequest");
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
			console.error("Error in playlistTracks");
			reject(error);
		});
	})
}

function getTotalPlaylistTrackObjects(inObj) {
	console.log("getTotalPlaylistTrackObjects");
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

		prom = new Promise((resolve, reject) => {
			getObjectsFromPlaylist(obj)
			.then(arr => {
				objArray.push(...arr);
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of getTotalPlaylistTrackObjects");
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
			console.error("Error in getTotalPlaylistTrackObjects");
			reject(error);
		})
	});
}

function getObjectsFromPlaylist(inObj) {
	console.log("getObjectsFromPlaylist");
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

		currentprom = new Promise((resolve, reject) => {
			playlistTrackObjectRequest(token, params, id)
			.then(arr => {
				objArray.push(...arr);
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of getObjectsFromPlaylist");
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
				console.error("Error in getObjectsFromPlaylist");
				reject(error);
			});
	});
}

function playlistTrackObjectRequest(token, params, href) {
	console.log("playlistTrackObjectRequest");
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
				console.error("Error in playlistObjectRequest");
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

function getFriendInitialTokens(req, res) {
	console.log("getFriendInitialTokens");
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;
	storedState = JSON.parse(storedState);
	storedState = storedState.state;

	if (state === null || state !== storedState) {
		throw new Error("state does not match storedState");
		res.redirect('/#' +
			querystring.stringify({
				error: 'state_mismatch'
			}));
	} else {
		res.clearCookie(stateKey);
		let authOptions = {
			method: 'POST',
			url: 'https://accounts.spotify.com/api/token',
			form: {
				code: code,
				redirect_uri: 'http://localhost:8889/finish/',
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
				console.error("Error obtaining access token from refresh token");

				res.redirect('/#' +
					querystring.stringify({
						error: 'invalid_token'
					}));
				reject(error);
			});
		});
	}
}

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
	url: 'https://accounts.spotify.com/api/token',
	headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
	form: {
	  grant_type: 'refresh_token',
	  refresh_token: refresh_token
	},
	json: true
  };

  request.post(authOptions, function(error, response, body) {
	if (!error && response.statusCode === 200) {
	  var access_token = body.access_token;
	  res.send({
		'access_token': access_token
	  });
	}
  });
});

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
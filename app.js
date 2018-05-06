/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var rp = require('request-promise');

var stateKey = 'spotify_auth_state';
var app = express();
var code;

var client_id = '15ec5ccbf8d648378ecefdf8bab3f58d'; // Your client id
var client_secret = 'a40cc81bc12a4ea0adcb04a8638bd1f2'; // Your secret
var redirect_uri = 'http://localhost:8889/callback/'; // Your redirect uri

var trackobjectsarr = [];
var mysongsarr = [];
var myplaylistobjarr = [];
var tokensreceived;

app.use(express.static(__dirname + '/public'))
	.use(cookieParser())
	.use(bodyParser.urlencoded({ extended: true }));

app.get('/login', postLogin);

function postLogin(req, res) {
	console.log("postLogin");
	var state = generateRandomString(16);
	res.cookie(stateKey, state);

	var scope = 'user-library-read playlist-modify-public';
	res.redirect('https://accounts.spotify.com/authorize?' +
	querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: redirect_uri,
		state: state
	}));
}

app.post('/friend',secondCallback)

var friendname;
var mysongscomplete;
var friendsongscomplete;

function secondCallback(req, res) {
	console.log("secondCallback");

	friendname = req.body.username;

	tokensreceived
	.then(getFriendData)
	.then(getFriendUniqueIds)
	.then(inObj => {
		friendsongscomplete = Promise.resolve(inObj);
	})
	.then(getCommonIds)
	.then(createPlaylist)
	.then(() => {
		res.redirect("postcreation.html");
	});
}

function createPlaylist(inObj) {
	var data = inObj.data;
	var playlistname = "me and " + friendname;
	makeEndpoint(playlistname, inObj.token, data)
	.then(addSongs)
	.then(blah => {
		console.log("everything done");
	});
}

function addSongs(inObj) {
	console.log("addSongs");

	var data = inObj.data;
	var playlistid = inObj.id;
	var token = inObj.token;

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
			postTracks(token, currentarr, playlistid)
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
				resolve("All done");
			})
			.catch(error => {
				console.error("Error in addSongs");
				reject(error);
			});
	});
}

function postTracks(token, tracks, playlistid) {
	console.log("postTracks");
	var options = {
		method: 'POST',
		form: JSON.stringify({uris: tracks}),
		url: 'https://api.spotify.com/v1/users/srijanduggal17/playlists/' + playlistid + '/tracks',
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

function makeEndpoint(name, token, data) {
	console.log("makeEndpoint");
	var options = {
		method: 'POST',
		form: JSON.stringify({name: name}),
		url: 'https://api.spotify.com/v1/users/srijanduggal17/playlists',
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
					data: data
				};
				resolve(outObj);
			})
			.catch(error => {
				console.error("Error in makeEndpoint");
				reject(error);
			});
	});
}

function cleanup(data) {
	var arr = [...data];
	var newarr = arr.map(x => 'spotify:track:' + x);
	return newarr;
}

function getCommonIds() {
	return new Promise((resolve, reject) => {
		var commonarr;

		Promise.all([mysongscomplete, friendsongscomplete])
		.then(sets => {
			commonarr = new Set([...sets[0]].filter(id => sets[1].data.has(id)));

			var outObj = {
				data: commonarr,
				token: sets[1].token
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in getCommonIds")
			reject(error);
		})
	})
}

function getFriendData(toks) {
	console.log("getFriendData");
	return new Promise((resolve, reject) => {
		getFriendTotalPlaylists(toks[0], friendname)
		.then(getFriendPlaylistObjects)
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

function getFriendTotalPlaylists(token, username) {
	console.log("getFriendTotalPlaylists");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/users/' + username + '/playlists?',
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

function getFriendPlaylistObjects(inObj) {
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
			friendPlaylistObjectRequest(token, params, username)
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

function friendPlaylistObjectRequest(token, params, username) {
	console.log("friendPlaylistObjectRequest");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/users/' + username +'/playlists?' + params + '',
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

function getFriendUniqueIds(inObj) {
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

	tokenrequest
	.then(toks => {
		tokensreceived = Promise.resolve(toks);
	});

	tokenrequest
	.then(getMyData)
	.then(combineArrays)
	.then(getUniqueIds)
	.then(arr => {
		console.log("done");
		console.log(arr);
		console.log(arr.size);

		mysongscomplete = Promise.resolve(arr);
	})
	.catch(error => {
		console.error("Error somewhere in main callback");
		console.log(error);
	});
}

function getInitialTokens(req, res) {
	console.log("getInitialTokens");
	code = req.query.code || null;
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
				res.redirect('/friends.html');

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
			resolve(results);
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
		getTotalPlaylists(token)
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

function getTotalPlaylists(token) {
	console.log("getTotalPlaylists");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/playlists?',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
		.then(body => {
			console.log('Total playlists received');
			var outObj = {
				totalplaylists: body.total,
				token: token
			}
			resolve(outObj);
		})
		.catch(error => {
			console.error("Error in getTotalPlaylists");
			reject(error);
		});
	});
}

function getPlaylistObjects(inObj) {
	console.log("getPlaylistObjects");
	var totalplaylists = inObj.totalplaylists;
	var token = inObj.token;

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
			playlistObjectRequest(token, params)
			.then(arr => {
				var playlistArr = [];
				for (let j = 0; j < arr.length; j++) {
					playlistArr.push(arr[j].tracks);
				}
				objArray.push(...playlistArr);
				resolve("resolved");
			})
			.catch(error => {
				console.error("Error in loop of getPlaylistObjects");
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
				console.error("Error in getPlaylistObjects");
				reject(error);
			});
	});
}

function playlistObjectRequest(token, params) {
	console.log("playlistObjectRequest");
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/playlists?' + params + '',
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
	var newarr = arr[0];
	newarr.push(...arr[1]);
	return newarr;
}

function getUniqueIds(arr) {
	var mydataset = new Set();
	for (let i = 0; i < arr.length; i++) {
		mydataset.add(arr[i].id);
	}
	return mydataset;
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

function getAccTok(reftok) {
	var acctok;

	let info = {
		method: 'POST',
		url: 'https://accounts.spotify.com/api/token',
		form: {
			grant_type : 'refresh_token',
			refresh_token: reftok
		},
		headers: {
			'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
		},
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(info)
		.then(body => {
			acctok = body.access_token;
			resolve(acctok);
		})
		.catch(error => {
			console.error("Error obtaining access token from refresh token");
			console.log(error);
			reject("Access token not obtained");
		});	
	});
}

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
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

app.use(express.static(__dirname + '/public'))
	.use(cookieParser());

//Application requests authorization
////////////////Section 1 ////////////////////////////
app.get('/login', postLogin);

function postLogin(req, res) {
	console.log("postLogin");
	var state = generateRandomString(16);
	res.cookie(stateKey, state);

	var scope = 'user-library-read';
	res.redirect('https://accounts.spotify.com/authorize?' +
	querystring.stringify({
		response_type: 'code',
		client_id: client_id,
		scope: scope,
		redirect_uri: redirect_uri,
		state: state
	}));
}

app.get('/callback', mainCallback);

function mainCallback(req, res) {
	console.log("mainCallback");
	getInitialTokens(req, res)
	.then(getMyData)
	.then(combineArrays)
	.then(getUniqueIds)
	.then(arr => {
		console.log("done");
		console.log(arr);
		console.log(arr.size);
	})
	.catch(err => {
		console.log(err);
	});
}

function getInitialTokens(req, res) {
	console.log("getInitialTokens");
	code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;

	if (state === null || state !== storedState) {
		res.redirect('/#' +
			querystring.stringify({
				error: 'state_mismatch'
			}));
	} else {
		res.clearCookie(stateKey);
		//Request access and refresh tokens
		///////////////////Section 2//////////////////////////////
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

				// we can also pass the token to the browser to make requests from there
				res.redirect('/#' +
					querystring.stringify({
						access_token: access_token,
						refresh_token: refresh_token
					}));

				var toks = [access_token, refresh_token];

				resolve(toks);
			})
			.catch(error => {
				console.error("Error obtaining access token from refresh token");
				console.log(error);

				res.redirect('/#' +
					querystring.stringify({
						error: 'invalid_token'
					}));
				reject("Access token not obtained");
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
		.catch(err => {
			reject('Error getting total saved tracks');
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
				console.error("error");
				reject("sorry");
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
				console.error("Error");
				console.log(error);
				reject("sorry");
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
		});
	})
}

function getTotalPlaylists(token) {
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
		.catch(err => {
			reject('Error getting total saved tracks');
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
				console.error("error");
				reject("sorry");
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
				console.error("Error");
				console.log(error);
				reject("sorry");
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
			});
		});

		promiseArr.push(prom);
	}

	return new Promise((resolve, reject) => {
		Promise.all(promiseArr)
		.then(() => {
			resolve(objArray);
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
				console.error("error");
				reject("sorry");
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
				console.error("Error");
				console.log(error);
				reject("sorry");
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
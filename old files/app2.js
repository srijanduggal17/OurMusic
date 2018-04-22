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
	//This functions requests authorization to use the API
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
	getInitialTokens(req, res)
		.then(toks => {
			let acctok = toks[0];
			getTotalSavedTracks(acctok)
				.then(totsongs => {
					console.log(totsongs);
					getTrackObjects(totsongs, acctok)
						.then(res => {
							console.log(res[0]);
							console.log(res.length);
						});
				})
				.catch(err => {
					console.log(err);
				});
			getTotalPlaylists(acctok)
		})
		.catch(err => {
			console.log(err)
		});
}

function getTotalPlaylists(token) {
	
}

function getMyPlaylistSongs(token) {
	let params = querystring.stringify({
		limit: 50
	});

	let options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/playlists?' + params + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	rp(options)
		.then(body => {
			let totalsongs = body.total;

			for (let i = 0; i < body.items.length; i++) {
				myplaylistobjarr.push(body.items[i].tracks);
			}

			getPlaylist(totalsongs, token)
		})
		.catch(error => {
			console.error("Error");
			console.log(error);
		});
}

function getPlaylist(tot, toke) {
	if (tot > 50) {
		let prevoffset = 0;
		let numtimes = Math.ceil((tot-50)/50);
		let promarr = [];
		for (let i = 0; i < numtimes; i++) {
			let paramobj = {
				limit: 50,
				offset: prevoffset + 50
			}; 
			let params = querystring.stringify(paramobj);
			prevoffset = paramobj.offset;

			promarr.push(getPlaylistObjs(params, token));
		}

		Promise.all(promarr)
			.then(() => {
				console.log("woohoo");
				console.log(myplaylistobjarr);
				console.log(myplaylistobjarr.length);
			})
			.catch(error => {
				console.log("buabuabua");
			});
	}
}

function getPlaylistObjs(para, token) {
	let options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/playlists?' + para + '',
		headers: { 'Authorization': 'Bearer ' + token },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				let resultarr = body.items;

				for (const ind in resultarr) {
					myplaylistobjarr.push(resultarr[ind].tracks);
				}
				resolve(body);
			})
			.catch(error => {
				console.error("Error");
				console.log(error);
				reject("sorry");
			});
	});
}

function getTotalSavedTracks(acctok) {
	var options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?',
		headers: { 'Authorization': 'Bearer ' + acctok },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
		.then(body => {
			let totalsongs = body.total;
			console.log('Total saved tracks logged');
			resolve(totalsongs);
		})
		.catch(err => {
			reject('Error getting total saved tracks');
		});	
	});
}

function getTrackObjects(tot, token) {
	if (tot <= 50) {
		let para = querystring.stringify({
			limit: 50
		});

		let options = {
			method: 'GET',
			url: 'https://api.spotify.com/v1/me/tracks?' + para + '',
			headers: { 'Authorization': 'Bearer ' + token },
			json: true
		};

		return new Promise ((resolve, reject) => {
			rp(options)
				.then(body => {
					trackobjectsarr = body.items;
					resolve(trackobjectsarr);
				})
				.catch(error => {
					console.error("Error");
					console.log(error);
					reject("sorry");
				});
		});
	}
	else {
		let prevoffset = -50;
		let numtimes = Math.ceil((tot-50)/50);
		let promarr = [];
		for (let i = 0; i < numtimes+1; i++) {
			let paramobj = {
				limit: 50,
				offset: prevoffset + 50
			}; 
			let params = querystring.stringify(paramobj);
			prevoffset = paramobj.offset;

			promarr.push(getTrackObjectSet(params, token));
		}

		return new Promise((resolve, reject) => {
			Promise.all(promarr)
				.then(() => {
					console.log("woohoo");
					resolve(trackobjectsarr);
				})
				.catch(error => {
					console.log("buabuabua");
					reject("sorry");
				});	
		});
	}
}

function getTrackObjectSet(para, toke) {
	let options = {
		method: 'GET',
		url: 'https://api.spotify.com/v1/me/tracks?' + para + '',
		headers: { 'Authorization': 'Bearer ' + toke },
		json: true
	};

	return new Promise ((resolve, reject) => {
		rp(options)
			.then(body => {
				let resultarr = body.items;
				trackobjectsarr.push(...resultarr);
				resolve("success");
			})
			.catch(error => {
				console.error("Error");
				console.log(error);
				reject("sorry");
			});
	});
}


function getInitialTokens(req, res) {
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
		var authOptions = {
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
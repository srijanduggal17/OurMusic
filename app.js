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

var client_id = '15ec5ccbf8d648378ecefdf8bab3f58d'; // Your client id
var client_secret = 'a40cc81bc12a4ea0adcb04a8638bd1f2'; // Your secret
var redirect_uri = 'http://localhost:8889/callback/'; // Your redirect uri

var mysongsarr = [];
var myplaylistobjarr = [];

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

var stateKey = 'spotify_auth_state';

var app = express();

var code;

app.use(express.static(__dirname + '/public'))
.use(cookieParser());

//Application requests authorization
////////////////Section 1 ////////////////////////////
app.get('/login', function(req, res) {
	var state = generateRandomString(16);
	res.cookie(stateKey, state);

	  // your application requests authorization
	  var scope = 'user-library-read';

	  res.redirect('https://accounts.spotify.com/authorize?' +
		querystring.stringify({
			response_type: 'code',
			client_id: client_id,
			scope: scope,
			redirect_uri: redirect_uri,
			state: state
		}));
});

app.get('/callback', function(req, res) {

	//Response query string has code and state
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

		request.post(authOptions, function(error, response, body) {
			if (!error && response.statusCode === 200) {
				var access_token = body.access_token,
				refresh_token = body.refresh_token;

				let songlim = querystring.stringify({
					limit: 50
				});

				var options = {
					url: 'https://api.spotify.com/v1/me/tracks?' + songlim + '',
					headers: { 'Authorization': 'Bearer ' + access_token },
					json: true
				};

				// use the access token to access the Spotify Web API
				//////////////Section 3////////////////////////
				request.get(options, function(error, response, body) {
					let totalsongs = body.total;

					for (let i = 0; i < body.items.length; i++) {
						mysongsarr.push(body.items[i].track.id);
					}

					getMySongs(totalsongs, access_token);
					getMyPlaylistSongs(access_token);
				});

				// we can also pass the token to the browser to make requests from there
				res.redirect('/#' +
					querystring.stringify({
						access_token: access_token,
						refresh_token: refresh_token
					}));
			} else {
				res.redirect('/#' +
					querystring.stringify({
						error: 'invalid_token'
					}));
			}
		});
	}
});

function getMySongs(tot, token) {
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

			promarr.push(getTrackSet(params, token));
		}

		Promise.all(promarr)
			.then(() => {
				console.log("woohoo");
				console.log(mysongsarr.length);
			})
			.catch(error => {
				console.log("buabuabua");
			});
	}
}

function getTrackSet(para, toke) {
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
				for (const ind in resultarr) {
					mysongsarr.push(resultarr[ind].track.id)
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

console.log('Listening on 8889');
app.listen(8889);

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
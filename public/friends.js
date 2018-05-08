// document.getElementById('friendpublicform').addEventListener("submit", submitFunc);
// document.getElementById('friendloginform').addEventListener("submit", submitFunc);


function submitFunc(formtype) {
	var valid = true;

	if (document.getElementById('playnameinput').value == "") {
		valid = false;
		console.log("no playlist name");
	}

	if ((formtype === "public") && document.getElementById('username').value == "") {
		valid = false;
		console.log("no username");
	}

	if (valid) {
		document.getElementById('maindiv').style.display = "none";
		document.getElementById('loading').style.display = "block";
		addPlaylistName(formtype);
		addDatabaseCookie(formtype);
	}

	return valid;
}

function addPlaylistName(formtype) {
	if (formtype === "public") {
		document.getElementById('friendpublicform').appendChild(document.getElementById('playnameinput'));
	}

	else if (formtype === "login") {
		document.getElementById('friendloginform').appendChild(document.getElementById('playnameinput'));
	}
}

function addDatabaseCookie(formtype) {
	var cookiesarr = document.cookie.split(';');
	cookiesarr = cookiesarr.filter(x => x.includes('__session='));
	var databasecookie = cookiesarr[0].split("=");
	var databaseref = databasecookie[1];

	var newelem = document.createElement('input');
	newelem.type = 'text';
	newelem.name = 'databaseref';
	newelem.value = databaseref;

	if (formtype === "public") {
		document.getElementById('friendpublicform').appendChild(newelem);
	}

	else if (formtype === "login") {
		document.getElementById('friendloginform').appendChild(newelem);
	}
}
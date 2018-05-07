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
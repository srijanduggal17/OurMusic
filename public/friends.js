const playlistInput = document.getElementById('playlistInput');
const usernameInput = document.getElementById('usernameInput');
const publicForm = document.getElementById('friendPublic');
const loginForm = document.getElementById('friendLogin');

playlistInput.addEventListener('input', greyClass);
usernameInput.addEventListener('input', greyClass);
document.getElementById('loginButton').addEventListener('click', verifyLogin);

function verifyLogin() {
	var valid = true;

	if (playlistInput.value == '') {
		valid = false;
		playlistInput.classList.add('wrong');
	}
	else {
		playlistInput.classList.remove('wrong');
	}

	if (valid) {
		document.getElementById('main').style.display = 'none';
		document.getElementById('continuation').style.display = 'grid';
	}
}

function greyClass() {
	this.classList.remove('wrong');
}

function submitFunc(formtype) {
	var valid = true;

	if (playlistInput.value == '') {
		valid = false;
		playlistInput.classList.add('wrong');
	}
	else {
		playlistInput.classList.remove('wrong');
	}

	if (formtype === 'public') {
		if (usernameInput.value == '') {
			valid = false;
			usernameInput.classList.add('wrong');
		}
		else {
			usernameInput.classList.remove('wrong');
		}
	}

	if (valid) {
		document.getElementById('main').style.display = 'none';
		document.getElementById('continuation').style.display = 'none';
		document.getElementById('loading').style.display = 'grid';
		addPlaylistName(formtype);
		addDatabaseToForm(formtype);
	}

	return valid;
}

function addPlaylistName(formtype) {
	if (formtype === 'public') {
		publicForm.appendChild(playlistInput);
	}

	else if (formtype === 'login') {
		loginForm.appendChild(playlistInput);
	}
}

function addDatabaseToForm(formtype) {
	var cookiesArray = document.cookie.split(';');
	cookiesArray = cookiesArray.filter(x => x.includes('__session='));
	var databaseCookie = cookiesArray[0].split('=');
	var databaseRef = databaseCookie[1];

	var databaseInput = document.createElement('input');
	databaseInput.type = 'text';
	databaseInput.name = 'databaseRef';
	databaseInput.value = databaseRef;

	if (formtype === 'public') {
		publicForm.appendChild(databaseInput);
	}

	else if (formtype === 'login') {
		loginForm.appendChild(databaseInput);
	}
}
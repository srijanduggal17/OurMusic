const playinput = document.getElementById('playnameinput');
const userinput = document.getElementById('username');
const publicform = document.getElementById('friendpublicform');
const loginform = document.getElementById('friendloginform');

playinput.addEventListener('input', greyClass);
userinput.addEventListener('input', greyClass);
document.getElementById('logbtn').addEventListener('click', verifyLogin);

function verifyLogin() {
	document.getElementById('maindiv').style.display = 'none';
	document.getElementById('continuation').style.display = 'grid';
}

function greyClass() {
	this.classList.remove('wrong');
}

function submitFunc(formtype) {
	var valid = true;

	if (playinput.value == '') {
		valid = false;
		playinput.classList.add('wrong');
	}
	else {
		playinput.classList.remove('wrong');
	}

	if (formtype === 'public') {
		if (userinput.value == '') {
			valid = false;
			userinput.classList.add('wrong');
		}
		else {
			userinput.classList.remove('wrong');
		}
	}

	if (valid) {
		document.getElementById('maindiv').style.display = 'none';
		document.getElementById('loading').style.display = 'grid';
		addPlaylistName(formtype);
		addDatabaseCookie(formtype);
	}

	return valid;
}

function addPlaylistName(formtype) {
	if (formtype === 'public') {
		publicform.appendChild(playinput);
	}

	else if (formtype === 'login') {
		loginform.appendChild(playinput);
	}
}

function addDatabaseCookie(formtype) {
	var cookiesarr = document.cookie.split(';');
	cookiesarr = cookiesarr.filter(x => x.includes('__session='));
	var databasecookie = cookiesarr[0].split('=');
	var databaseref = databasecookie[1];

	var newelem = document.createElement('input');
	newelem.type = 'text';
	newelem.name = 'databaseref';
	newelem.value = databaseref;

	if (formtype === 'public') {
		publicform.appendChild(newelem);
	}

	else if (formtype === 'login') {
		loginform.appendChild(newelem);
	}
}
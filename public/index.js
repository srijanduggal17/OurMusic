document.getElementById('submitbutton').addEventListener("click", postSubmit);
document.getElementById('loginbutton').addEventListener("click", postSubmit);

function postSubmit() {
	document.getElementById('maindiv').style.display = "none";
	document.getElementById('loading').style.display = "block";
}
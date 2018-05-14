var cookiesarr = document.cookie.split(';');
cookiesarr = cookiesarr.filter(x => x.includes('__session='));
var uri = cookiesarr[0].split('=')[1];
uri = uri.split('%3A');
uri.shift();
var embedlink = 'https://open.spotify.com/embed/' + uri.join('/');

var newelement = document.createElement('iframe');
newelement.src = embedlink;
newelement.frameborder = '0';
newelement.allowtransparency = 'true';
newelement.allow = 'encrypted-media';
newelement.className = 'playlistembed';

document.getElementById('maindiv').appendChild(newelement);
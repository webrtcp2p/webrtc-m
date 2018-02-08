

//webrtc.js:  This is where we will put the bulk of the webrtc related code

////////SIGNALING CODE/////////////
io = io.connect();
var myName = "";
var theirName = "";
var myUserType = "";
var configuration = {
	'iceServers': [{
		'url': 'stun:stun.l.google.com:19302'
	}]
};
var rtcPeerConn;
var mainVideoArea = document.querySelector("#mainVideoTag");
var smallVideoArea = document.querySelector("#smallVideoTag");
var dataChannelOptions = {
	ordered: false, //no guaranteed delivery, unreliable but faster 
	maxRetransmitTime: 1000, //milliseconds
};
var dataChannel;

io.on('signal', function(data) {
	if (data.user_type == "expert" && data.command == "joinroom") {
		console.log("The expert is here!");
		if (myUserType == "student") {
			theirName = data.user_name;
			document.querySelector("#messageOutName").textContent = theirName;
			document.querySelector("#messageInName").textContent = myName;
		}
		//Switch to the expert listing
		document.querySelector("#requestExpertForm").style.display = 'none';
		document.querySelector("#waitingForExpert").style.display = 'none';
		document.querySelector("#expertListing").style.display = 'block';
	}
	else if (data.user_type == "student" && data.command == "callexpert") {
		console.log("Student is calling");
		if (!rtcPeerConn) startSignaling();
		if (myUserType == "expert") {
			theirName = data.user_name;
			document.querySelector("#messageOutName").textContent = theirName;
			document.querySelector("#messageInName").textContent = myName;
		}
		document.querySelector("#expertSignup").style.display = 'none';
		document.querySelector("#videoPage").style.display = 'block';
	}
	else if (data.user_type == 'signaling') {
		if (!rtcPeerConn) startSignaling();
		var message = JSON.parse(data.user_data);
		if (message.sdp) {
			rtcPeerConn.setRemoteDescription(new RTCSessionDescription(message.sdp), function () {
				// if we received an offer, we need to answer
				if (rtcPeerConn.remoteDescription.type == 'offer' && myUserType == "expert") {
					rtcPeerConn.createAnswer(sendLocalDesc, logError);
				}
			}, logError);
		}
		else {
			rtcPeerConn.addIceCandidate(new RTCIceCandidate(message.candidate));
		}
	}
}); 

function startSignaling() {
	console.log("starting signaling...");
	rtcPeerConn = new webkitRTCPeerConnection(configuration);
	dataChannel = rtcPeerConn.createDataChannel('textMessages', dataChannelOptions);
				
	dataChannel.onopen = dataChannelStateChanged;
	rtcPeerConn.ondatachannel = receiveDataChannel;
	
	// send any ice candidates to the other peer
	rtcPeerConn.onicecandidate = function (evt) {
		if (evt.candidate)
			io.emit('signal',{"user_type":"signaling", "command":"icecandidate", "user_data": JSON.stringify({ 'candidate': evt.candidate })});
		console.log("completed sending an ice candidate...");
	};
	
	// let the 'negotiationneeded' event trigger offer generation
	rtcPeerConn.onnegotiationneeded = function () {
		console.log("on negotiation called");
		if (myUserType == "student") {
			rtcPeerConn.createOffer(sendLocalDesc, logError);
		}
	};
	
	// once remote stream arrives, show it in the main video element
	rtcPeerConn.onaddstream = function (evt) {
		console.log("going to add their stream...");
		mainVideoArea.src = URL.createObjectURL(evt.stream);
	};
	
	// get a local stream, show it in our video tag and add it to be sent
	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
	navigator.getUserMedia({
		'audio': true,
		'video': true
	}, function (stream) {
		console.log("going to display my stream...");
		smallVideoArea.src = URL.createObjectURL(stream);
		rtcPeerConn.addStream(stream);
	}, logError);
			  
}

function sendLocalDesc(desc) {
	rtcPeerConn.setLocalDescription(desc, function () {
		console.log("sending local description");
		io.emit('signal',{"user_type":"signaling", "command":"SDP", "user_data": JSON.stringify({ 'sdp': rtcPeerConn.localDescription })});
	}, logError);
}
			
function logError(error) {
}

//////////MUTE/PAUSE STREAMS CODE////////////
var muteMyself = document.querySelector("#muteMyself");
var pauseMyVideo = document.querySelector("#pauseMyVideo");

muteMyself.addEventListener('click', function(ev){
	console.log("muting/unmuting myself");
	var streams = rtcPeerConn.getLocalStreams();
	for (var stream of streams) {
		for (var audioTrack of stream.getAudioTracks()) {
			if (audioTrack.enabled) { muteMyself.innerHTML = "Unmute" }
			else { muteMyself.innerHTML = "Mute Myself" }
			audioTrack.enabled = !audioTrack.enabled;
		}
		console.log("Local stream: " + stream.id);
	}
	ev.preventDefault();
}, false);

pauseMyVideo.addEventListener('click', function(ev){
	console.log("pausing/unpausing my video");
	var streams = rtcPeerConn.getLocalStreams();
	for (var stream of streams) {
		for (var videoTrack of stream.getVideoTracks()) {
			if (videoTrack.enabled) { pauseMyVideo.innerHTML = "Start Video" }
			else { pauseMyVideo.innerHTML = "Pause Video" }
			videoTrack.enabled = !videoTrack.enabled;
		}
		console.log("Local stream: " + stream.id);
	}
	ev.preventDefault();
}, false);

/////////////Data Channels Code///////////
var messageHolder = document.querySelector("#messageHolder");
var myMessage = document.querySelector("#myMessage");
var sendMessage = document.querySelector("#sendMessage");
var receivedFileName;
var receivedFileSize;
var fileBuffer = [];
var fileSize = 0;
var fileTransferring = false;

function dataChannelStateChanged() {
	if (dataChannel.readyState === 'open') {
		console.log("Data Channel open");
		dataChannel.onmessage = receiveDataChannelMessage;
	}
}

function receiveDataChannel(event) {
	console.log("Receiving a data channel");
	dataChannel = event.channel;
	dataChannel.onmessage = receiveDataChannelMessage;
}

function receiveDataChannelMessage(event) {
	console.log("From DataChannel: " + event.data);
	if (fileTransferring) {
		//Now here is the file handling code:
		fileBuffer.push(event.data);
		fileSize += event.data.byteLength;
		fileProgress.value = fileSize;
				
		//Provide link to downloadable file when complete
		if (fileSize === receivedFileSize) {
			var received = new window.Blob(fileBuffer);
			fileBuffer = [];

			downloadLink.href = URL.createObjectURL(received);
			downloadLink.download = receivedFileName;
			downloadLink.appendChild(document.createTextNode(receivedFileName + "(" + fileSize + ") bytes"));
			fileTransferring = false;
			
			//Also put the file in the text chat area
			var linkTag = document.createElement('a');
			linkTag.href = URL.createObjectURL(received);
			linkTag.download = receivedFileName;
			linkTag.appendChild(document.createTextNode(receivedFileName));
			var div = document.createElement('div');
			div.className = 'message-out';
			div.appendChild(linkTag);
			messageHolder.appendChild(div);
		}
	}
	else {
		appendChatMessage(event.data, 'message-out');
	}
}

document.getElementById("myMessage")
    .addEventListener("keyup", function(event) {
    event.preventDefault();
    if (event.keyCode === 13) {
        document.getElementById("sendMessage").click();
    }
});

sendMessage.addEventListener('click', function(ev){
	dataChannel.send(myMessage.value);
	appendChatMessage(myMessage.value, 'message-in');
	myMessage.value = "";
	ev.preventDefault();
}, false);

function appendChatMessage(msg, className) {
	var div = document.createElement('div');
	div.className = className;
	div.innerHTML = '<span>' + msg + '</span>';
	messageHolder.appendChild(div);
}



import * as React from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Remove the hardcoded people array
// const people = ["John Smith", "Jane Doe", "Bob Johnson"];

function App() {
  const [selectedPerson, setSelectedPerson] = React.useState(null);
  const [messages, setMessages] = React.useState({});
  const [input, setInput] = React.useState("");
  const [currentUser, setCurrentUser] = React.useState("");
  const [usernameDialogOpen, setUsernameDialogOpen] = React.useState(true);
  const [onlineUsers, setOnlineUsers] = React.useState([]);
  const socketRef = useRef();
  const [localStream, setLocalStream] = React.useState(null);
  const [remoteStream, setRemoteStream] = React.useState(null);
  const peerRef = useRef();

  useEffect(() => {
    socketRef.current = io('http://localhost:5000');
    socketRef.current.on('users', (users) => {
      setOnlineUsers(users);
    });
    socketRef.current.on('receive_message', (data) => {
      setMessages(prev => ({
        ...prev,
        [data.from]: [...(prev[data.from] || []), { sender: data.from, text: data.message }]
      }));
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const handleSend = () => {
    if (!input.trim() || !selectedPerson) return;
    setMessages(prev => ({
      ...prev,
      [selectedPerson]: [...(prev[selectedPerson] || []), { sender: currentUser, text: input }]
    }));
    socketRef.current.emit('send_message', {
      to: selectedPerson,
      from: currentUser,
      message: input
    });
    setInput("");
  };

  // Username dialog logic
  const [tempUsername, setTempUsername] = React.useState("");
  const handleUsernameSubmit = () => {
    if (tempUsername.trim()) {
      setCurrentUser(tempUsername.trim());
      setUsernameDialogOpen(false);
      socketRef.current.emit('register', tempUsername.trim());
    }
  };

  return (
    <>
      {usernameDialogOpen && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', bgcolor: 'rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ bgcolor: 'white', p: 4, borderRadius: 2, minWidth: 300 }}>
            <Typography variant="h6" gutterBottom>Enter your username</Typography>
            <TextField
              fullWidth
              value={tempUsername}
              onChange={e => setTempUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUsernameSubmit(); }}
              autoFocus
            />
            <Button variant="contained" sx={{ mt: 2 }} onClick={handleUsernameSubmit}>Start Chatting</Button>
          </Box>
        </Box>
      )}
      <Box sx={{ display: 'flex', height: '100vh', filter: usernameDialogOpen ? 'blur(2px)' : 'none', pointerEvents: usernameDialogOpen ? 'none' : 'auto' }}>
        <Box sx={{ width: 250, bgcolor: '#f5f5f5', p: 2 }}>
          <Typography variant="h6" gutterBottom>
            People
          </Typography>
          <List>
            {onlineUsers.filter(u => u !== currentUser).map((person) => (
              <ListItem
                button
                key={person}
                selected={selectedPerson === person}
                onClick={() => setSelectedPerson(person)}
              >
                <ListItemText primary={person} />
              </ListItem>
            ))}
          </List>
        </Box>
        <Box sx={{ flex: 1, p: 3, display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <Typography variant="h5">Chat Area</Typography>
          {selectedPerson ? (
            <>
              <Typography>You are chatting with {selectedPerson}.</Typography>
              <Box sx={{ flex: 1, overflowY: 'auto', my: 2, bgcolor: '#fafafa', p: 2, borderRadius: 1 }}>
                {(messages[selectedPerson] || []).map((msg, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      justifyContent: msg.sender === currentUser ? 'flex-end' : 'flex-start',
                      mb: 1
                    }}
                  >
                    <Box
                      sx={{
                        bgcolor: msg.sender === currentUser ? '#1976d2' : '#e0e0e0',
                        color: msg.sender === currentUser ? 'white' : 'black',
                        px: 2,
                        py: 1,
                        borderRadius: 2,
                        maxWidth: '70%'
                      }}
                    >
                      <b>{msg.sender}:</b> {msg.text}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Type a message..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                  disabled={!currentUser}
                />
                <Button variant="contained" onClick={handleSend} disabled={!currentUser}>Send</Button>
              </Box>
            </>
          ) : (
            <Typography>Select a person to start chatting.</Typography>
          )}
        </Box>
      </Box>
    </>
  );
}

export default App;

const startCall = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  setLocalStream(stream);
  peerRef.current = new RTCPeerConnection();
  stream.getTracks().forEach(track => peerRef.current.addTrack(track, stream));
  peerRef.current.onicecandidate = (e) => {
    if (e.candidate) {
      socketRef.current.emit('ice-candidate', { to: selectedPerson, candidate: e.candidate });
    }
  };
  peerRef.current.ontrack = (e) => {
    setRemoteStream(e.streams[0]);
  };
  const offer = await peerRef.current.createOffer();
  await peerRef.current.setLocalDescription(offer);
  socketRef.current.emit('video-offer', { to: selectedPerson, offer });
};

// Listen for signaling events from server (add in useEffect)
socketRef.current.on('video-offer', async (data) => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  setLocalStream(stream);
  peerRef.current = new RTCPeerConnection();
  stream.getTracks().forEach(track => peerRef.current.addTrack(track, stream));
  peerRef.current.onicecandidate = (e) => {
    if (e.candidate) {
      socketRef.current.emit('ice-candidate', { to: data.from, candidate: e.candidate });
    }
  };
  peerRef.current.ontrack = (e) => {
    setRemoteStream(e.streams[0]);
  };
  await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerRef.current.createAnswer();
  await peerRef.current.setLocalDescription(answer);
  socketRef.current.emit('video-answer', { to: data.from, answer });
});
socketRef.current.on('video-answer', async (data) => {
  await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
});
socketRef.current.on('ice-candidate', async (data) => {
  try {
    await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
  } catch (e) {}
});

// Add video elements to render local and remote streams
{localStream && (
  <video autoPlay playsInline muted ref={video => video && (video.srcObject = localStream)} style={{ width: 200 }} />
)}
{remoteStream && (
  <video autoPlay playsInline ref={video => video && (video.srcObject = remoteStream)} style={{ width: 200 }} />
)}
<Button onClick={startCall} disabled={!selectedPerson}>Start Video Call</Button>

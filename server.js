// Import the WebSocket library
const WebSocket = require('ws');

// Create a new WebSocket server
//const wss = new WebSocket.Server({ port: 8080 }); //local testing
const WEB_SOCKET_PORT = process.env.WEBSOCKET_PORT || 5000;

const wss = new WebSocket.Server({ port: WEB_SOCKET_PORT });

const players = new Map();  // Map to store player connections
const parties = new Map();  // Map to store party members
let lobby = []; // Array to store players in the lobby

// Function to send message to a specific player
function sendToPlayer(playerId, message) {
  const player = players.get(playerId);
  if (player && player.readyState === WebSocket.OPEN) {
    player.send(JSON.stringify(message));
  }
}

// Function to send message to all players
function sendToAll(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Function to send message to a specific party
function sendToParty(partyId, message) {
  const party = parties.get(partyId);
  if (party) {
    party.forEach(playerId => {
      sendToPlayer(playerId, message);
    });
  }
}

// Handling new connections
// Handling new connections
wss.on('connection', (ws) => {
  console.log("User Connected !!")
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error('Invalid JSON:', error);
      return;
    }
    console.log(message.type);
    switch (message.type) {
      case 'register':
        players.set(message.playerId, ws);
        lobby.push(message.playerId); // Add player to the lobby
        console.log("User Registered - ID:", message.playerId);
        break;

      case 'createParty':
        console.log("User wants to create a party:", message.partyId);
        if (!parties.has(message.partyId)) {
          parties.set(message.partyId, [message.playerId]); // Add party creator to the party
          console.log("Party created with ID:", message.partyId);
        } else {
          console.log("Party with ID", message.partyId, "already exists");
        }
        break;

      case 'joinParty':
        console.log("User wants to join party:", message.partyId);
        if (!parties.has(message.partyId)) {
          console.log("Party with ID", message.partyId, "does not exist");
          break;
        }
        parties.get(message.partyId).push(message.playerId);
        break;

      case 'leaveParty':
        console.log("User wants to leave party:", message.partyId);
        if (parties.has(message.partyId)) {
          parties.set(message.partyId, parties.get(message.partyId).filter(id => id !== message.playerId));
        }
        break;

      case 'getPartyMembers':
        console.log("User wants to get party members for party:", message.partyId);
        const partyMembers = getPartyMembers(message.partyId);
        ws.send(JSON.stringify({ type: 'partyMembers', members: partyMembers }));
        break;

      case 'privateMessage':
        console.log("User wants to send private message to:", message.targetPlayerId);
        sendToPlayer(message.targetPlayerId, { from: message.playerId, text: message.message });
        break;

      case 'partyMessage':
        console.log("User wants to send party message in party:", message.partyId);
        sendToParty(message.partyId, { from: message.playerId, text: message.message });
        break;

      case 'globalMessage':
        console.log("User wants to send global message");
        sendToAll({ from: message.playerId, text: message.message });
        break;

      case 'lobbyMessage':
        console.log("User wants to send lobby message");
        // Send message to all players in the lobby
        lobby.forEach(playerId => {
          sendToPlayer(playerId, { from: message.playerId, text: message.message });
        });
        break;

      default:
        console.error('Unknown message type:', message.type);
    }
  });

  ws.on('close', () => {
    console.log("User Disconnected !!")
    // Remove player from all parties
    players.forEach((_, playerId) => {
      parties.forEach((party, partyId) => {
        parties.set(partyId, party.filter(id => id !== playerId));
      });
    });

    // Remove player from players map and lobby
    players.forEach((_, playerId) => {
      if (players.get(playerId) === ws) {
        players.delete(playerId);
        lobby = lobby.filter(id => id !== playerId);
      }
    });
  });
});

console.log('WebSocket server is running !!');
//console.log('WebSocket server is running on ws://localhost:8080');

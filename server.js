const WebSocket = require('ws');

const WEB_SOCKET_PORT = process.env.WEBSOCKET_PORT || 5000;
const wss = new WebSocket.Server({ port: WEB_SOCKET_PORT });

const players = new Map();
const parties = new Map();
let lobby = [];

function sendToPlayer(playerId, message) {
  const player = players.get(playerId);
  if (player && player.readyState === WebSocket.OPEN) {
    player.send(JSON.stringify(message));
  }
}

function sendToAll(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function sendToParty(partyId, message) {
  const party = parties.get(partyId);
  if (party) {
    party.forEach(playerId => {
      sendToPlayer(playerId, message);
    });
  }
}

wss.on('connection', (ws) => {
  console.log("User Connected !!");
  
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
        lobby.push(message.playerId);
        console.log("User Registered - ID:", message.playerId);
        break;

      case 'createParty':
        console.log("User wants to create a party:", message.partyId);
        if (!parties.has(message.partyId)) {
          parties.set(message.partyId, [message.playerId]);
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
        const privateMessage = {
          type: 'privateMessage',
          from: message.playerId,
          to: message.targetPlayerId,
          text: message.message
        };
        sendToPlayer(message.targetPlayerId, privateMessage);
        break;

      case 'partyMessage':
        console.log("User wants to send party message in party:", message.partyId);
        const partyMessage = {
          type: 'partyMessage',
          from: message.playerId,
          partyId: message.partyId,
          text: message.message
        };
        sendToParty(message.partyId, partyMessage);
        break;

      case 'globalMessage':
        console.log("User wants to send global message");
        const globalMessage = {
          type: 'globalMessage',
          from: message.playerId,
          text: message.message
        };
        sendToAll(globalMessage);
        break;

      case 'lobbyMessage':
        console.log("User wants to send lobby message");
        const lobbyMessage = {
          type: 'lobbyMessage',
          from: message.playerId,
          text: message.message
        };
        lobby.forEach(playerId => {
          sendToPlayer(playerId, lobbyMessage);
        });
        break;

      default:
        console.error('Unknown message type:', message.type);
    }
  });

  ws.on('close', () => {
    console.log("User Disconnected !!");
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

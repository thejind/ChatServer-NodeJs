const { v4: uuidv4 } = require('uuid');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const WEB_SOCKET_PORT = process.env.WEBSOCKET_PORT || 5000;

const players = new Map();
const parties = new Map();
let lobby = [];
const mutedPlayers = new Map();

function sendToPlayer(playerId, message) {
  const player = players.get(playerId);
  if (player) {
    player.emit('message', message);
  }
}

function sendToAll(message) {
  io.emit('message', message);
}

function sendToParty(partyId, message) {
  const party = parties.get(partyId);
  if (party) {
    party.forEach(playerId => {
      if (!isMuted(playerId, message.from)) {
        sendToPlayer(playerId, message);
      }
    });
  }
}

function getPartyMembers(partyId) {
  return parties.has(partyId) ? parties.get(partyId) : [];
}

function isMuted(playerId, senderId) {
  const muted = mutedPlayers.get(playerId) || [];
  return muted.includes(senderId);
}

function emptyParty(partyId) {
  if (parties.has(partyId)) {
    const partyMembers = parties.get(partyId);
    parties.set(partyId, []);
    console.log(`Party with ID ${partyId} emptied successfully.`);
    partyMembers.forEach(memberId => {
      sendToPlayer(memberId, { type: 'partyEmpty', partyId: partyId });
    });
  } else {
    console.log(`Party with ID ${partyId} does not exist.`);
  }
}

io.on('connection', (socket) => {
  console.log("User Connected !!");

  const SID = uuidv4();
  console.log(`User Connected with SID: ${SID}`);
  socket.emit('connection', { connection: true, sid: SID });

  socket.on('message', (data) => {
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
        players.set(message.senderId, socket);
        lobby.push(message.senderId);
        console.log("User Registered - ID:", message.senderId);
        break;

      case 'createParty':
        console.log("User wants to create a party:", message.partyId);
        if (!parties.has(message.partyId)) {
          parties.set(message.partyId, [message.senderId]);
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
        parties.get(message.partyId).push(message.senderId);
        break;

      case 'leaveParty':
        console.log("User wants to leave party:", message.partyId);
        if (parties.has(message.partyId)) {
          parties.set(message.partyId, parties.get(message.partyId).filter(id => id !== message.senderId));
        }
        break;

      case 'getPartyMembers':
        console.log("User wants to get party members for party:", message.partyId);
        const partyMembers = getPartyMembers(message.partyId);
        socket.emit('message', { type: 'partyMembers', members: partyMembers });
        break;

      case 'emptyParty':
        console.log("User wants to empty party:", message.partyId);
        emptyParty(message.partyId);
        break;

      case 'privateMessage':
        console.log("User wants to send private message to:", message.targetPlayerId);
        const privateMessage = {
          type: 'privateMessage',
          from: message.senderId,
          to: message.targetPlayerId,
          text: message.message
        };
        if (!isMuted(message.targetPlayerId, message.senderId)) {
          sendToPlayer(message.targetPlayerId, privateMessage);
        }
        break;

      case 'partyMessage':
        console.log("User wants to send party message in party:", message.partyId);
        const partyMessage = {
          type: 'partyMessage',
          from: message.senderId,
          partyId: message.partyId,
          text: message.message
        };
        sendToParty(message.partyId, partyMessage);
        break;

      case 'globalMessage':
        console.log("User wants to send global message");
        const globalMessage = {
          type: 'globalMessage',
          from: message.senderId,
          text: message.message
        };
        sendToAll(globalMessage);
        break;

      case 'lobbyMessage':
        console.log("User wants to send lobby message");
        const lobbyMessage = {
          type: 'lobbyMessage',
          from: message.senderId,
          text: message.message
        };
        lobby.forEach(playerId => {
          if (!isMuted(playerId, message.senderId)) {
            sendToPlayer(playerId, lobbyMessage);
          }
        });
        break;

      case 'mutePlayer':
        console.log("User wants to mute player:", message.targetPlayerId);
        const mutedList = mutedPlayers.get(message.senderId) || [];
        if (!mutedList.includes(message.targetPlayerId)) {
          mutedList.push(message.targetPlayerId);
          mutedPlayers.set(message.senderId, mutedList);
          console.log(`Player ${message.senderId} muted player ${message.targetPlayerId}`);
        }
        break;

      case 'unmutePlayer':
        console.log("User wants to unmute player:", message.targetPlayerId);
        const currentMutedList = mutedPlayers.get(message.senderId) || [];
        if (currentMutedList.includes(message.targetPlayerId)) {
          mutedPlayers.set(message.senderId, currentMutedList.filter(id => id !== message.targetPlayerId));
          console.log(`Player ${message.senderId} unmuted player ${message.targetPlayerId}`);
        }
        break;

      default:
        console.error('Unknown message type:', message.type);
    }
  });

  socket.on('disconnect', () => {
    console.log("User Disconnected !!");
    let disconnectedPlayerId;

    players.forEach((playerSocket, playerId) => {
      if (playerSocket === socket) {
        disconnectedPlayerId = playerId;
        players.delete(playerId);
        lobby = lobby.filter(id => id !== playerId);
      }
    });

    if (disconnectedPlayerId) {
      parties.forEach((party, partyId) => {
        parties.set(partyId, party.filter(id => id !== disconnectedPlayerId));
      });
    }
  });
});

server.listen(WEB_SOCKET_PORT, () => {
  console.log(`WebSocket server is running on port ${WEB_SOCKET_PORT} !!`);
});

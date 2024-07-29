const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const url = require('url');

const WEB_SOCKET_PORT = process.env.WEBSOCKET_PORT || 5000;
const wss = new WebSocket.Server({ port: WEB_SOCKET_PORT });

const players = new Map();
const parties = new Map();
let lobby = [];
const mutedPlayers = new Map();

function sendToPlayer(playerId, message) {
  const player = players.get(playerId);
  if (player && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify(message));
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
      if (!isMuted(playerId, message.from)) {
        sendToPlayer(playerId, message);
      }
    });
  }
}

function getPartyMembers(partyId) {
  if (!parties.has(partyId)) {
    return [];
  }
  const partyMembers = Array.from(parties.get(partyId)); // Convert Set to Array
  return partyMembers.map(memberId => players.get(memberId).name);
}

function isMuted(playerId, senderId) {
  const muted = mutedPlayers.get(playerId) || [];
  return muted.includes(senderId);
}

function emptyParty(partyId) {
  if (parties.has(partyId)) {
    const partyMembers = parties.get(partyId);
    parties.set(partyId, new Set());
    console.log(`Party with ID ${partyId} emptied successfully.`);
    partyMembers.forEach(memberId => {
      sendToPlayer(memberId, { type: 'partyEmpty', partyId });
    });
  } else {
    console.log(`Party with ID ${partyId} does not exist.`);
  }
}

wss.on('connection', (ws, req) => {
  console.log("User Connected !!");

  const parsedUrl = url.parse(req.url, true);
  const params = parsedUrl.query;
  const playerName = params.name;

  if (!playerName) {
    console.error('Connection parameters must include a name.');
    ws.close();
    return;
  }

  const SID = uuidv4();
  console.log(`User Connected with SID: ${SID} and Name: ${playerName}`);

  players.set(SID, { ws, name: playerName });
  lobby.push(SID);

  ws.send(JSON.stringify({ connection: true, sid: SID, name: playerName }));

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error('Invalid JSON:', error);
      return;
    }

    console.log(message.type);
    handleMessage(ws, message);
  });

  ws.on('close', () => {
    console.log("User Disconnected !!");
    handleDisconnect(ws);
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'createParty':
      handleCreateParty(message);
      break;

    case 'joinParty':
      handleJoinParty(message);
      break;

    case 'leaveParty':
      handleLeaveParty(message);
      break;

    case 'getPartyMembers':
      handleGetPartyMembers(ws, message);
      break;

    case 'emptyParty':
      handleEmptyParty(message);
      break;

    case 'privateMessage':
      handlePrivateMessage(message);
      break;

    case 'partyMessage':
      handlePartyMessage(message);
      break;

    case 'globalMessage':
      handleGlobalMessage(message);
      break;

    case 'lobbyMessage':
      handleLobbyMessage(message);
      break;

    case 'mutePlayer':
      handleMutePlayer(message);
      break;

    case 'unmutePlayer':
      handleUnmutePlayer(message);
      break;

    default:
      console.error('Unknown message type:', message.type);
  }
}

function handleCreateParty(message) {
  console.log("User wants to create a party:", message.partyId);
  if (!parties.has(message.partyId)) {
    parties.set(message.partyId, new Set([message.senderId]));
    console.log("Party created with ID:", message.partyId);
  } else {
    console.log("Party with ID", message.partyId, "already exists");
  }
}

function handleJoinParty(message) {
  console.log("User wants to join party:", message.partyId);
  if (!parties.has(message.partyId)) {
    console.log("Party with ID", message.partyId, "does not exist");
    return;
  }
  parties.get(message.partyId).add(message.senderId);
}

function handleLeaveParty(message) {
  console.log("User wants to leave party:", message.partyId);
  if (parties.has(message.partyId)) {
    parties.get(message.partyId).delete(message.senderId);
  }
}

function handleGetPartyMembers(ws, message) {
  console.log("User wants to get party members for party:", message.partyId);
  const partyMembers = getPartyMembers(message.partyId);
  ws.send(JSON.stringify({ type: 'partyMembers', members: partyMembers }));
}

function handleEmptyParty(message) {
  console.log("User wants to empty party:", message.partyId);
  emptyParty(message.partyId);
}

function handlePrivateMessage(message) {
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
}

function handlePartyMessage(message) {
  console.log("User wants to send party message in party:", message.partyId);
  const partyMessage = {
    type: 'partyMessage',
    from: message.senderId,
    partyId: message.partyId,
    text: message.message
  };
  sendToParty(message.partyId, partyMessage);
}

function handleGlobalMessage(message) {
  console.log("User wants to send global message");
  const globalMessage = {
    type: 'globalMessage',
    from: message.senderId,
    text: message.message
  };
  sendToAll(globalMessage);
}

function handleLobbyMessage(message) {
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
}

function handleMutePlayer(message) {
  console.log("User wants to mute player:", message.targetPlayerId);
  const mutedList = mutedPlayers.get(message.senderId) || [];
  if (!mutedList.includes(message.targetPlayerId)) {
    mutedList.push(message.targetPlayerId);
    mutedPlayers.set(message.senderId, mutedList);
    console.log(`Player ${message.senderId} muted player ${message.targetPlayerId}`);
  }
}

function handleUnmutePlayer(message) {
  console.log("User wants to unmute player:", message.targetPlayerId);
  const currentMutedList = mutedPlayers.get(message.senderId) || [];
  if (currentMutedList.includes(message.targetPlayerId)) {
    mutedPlayers.set(message.senderId, currentMutedList.filter(id => id !== message.targetPlayerId));
    console.log(`Player ${message.senderId} unmuted player ${message.targetPlayerId}`);
  }
}

function handleDisconnect(ws) {
  let disconnectedPlayerId;

  players.forEach((player, playerId) => {
    if (player.ws === ws) {
      disconnectedPlayerId = playerId;
      players.delete(playerId);
      lobby = lobby.filter(id => id !== playerId);
    }
  });

  if (disconnectedPlayerId) {
    parties.forEach((party, partyId) => {
      party.delete(disconnectedPlayerId);
    });
  }
}

console.log('WebSocket server is running !!');

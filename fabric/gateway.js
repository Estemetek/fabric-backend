const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const {
  mspId, channelName, chaincodeName,
  peerEndpoint, peerHostAlias,
  tlsRootCert, userCert, userKey
} = require('./config');

let gateway;   // memoized gateway
let client;    // grpc client

async function connectGateway() {
  if (gateway) return gateway;

  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  client = new grpc.Client(peerEndpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': peerHostAlias, // crucial for TLS SNI/hostname match
  });

  // Build identity and signer
  const identity = { mspId, credentials: userCert };
  const privateKey = crypto.createPrivateKey(userKey);
  const signer = signers.newPrivateKeySigner(privateKey);

  // Reasonable deadlines (avoid indefinite hangs)
  gateway = connect({
    client,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions:  () => ({ deadline: Date.now() + 15000 }),
    submitOptions:   () => ({ deadline: Date.now() + 15000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  return gateway;
}

function getNetwork() {
  if (!gateway) throw new Error('Gateway not initialized');
  return gateway.getNetwork(channelName);
}

function getContract() {
  return getNetwork().getContract(chaincodeName);
}

async function closeGateway() {
  if (gateway) {
    await gateway.close();
    gateway = undefined;
  }
  if (client) {
    client.close();
    client = undefined;
  }
}

module.exports = {
  connectGateway,
  getNetwork,
  getContract,
  closeGateway,
};

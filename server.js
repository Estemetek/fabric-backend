const express = require("express");
const cors = require("cors");   // <-- import cors
const { Gateway, Wallets } = require("fabric-network");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// allow Ionic frontend to connect
app.use(cors({
  origin: ["http://localhost:8100"],  // Ionic dev server
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Hyperledger Fabric connection variables
const channelName = "mychannel";
const chaincodeName = "basic";
const mspId = "Org1MSP";
const walletPath = path.join(__dirname, "wallet"); // store identities here
// const ccpPath = path.resolve(__dirname, "connections", "connection-org1.json"); // <-- updated
const ccpPath = path.join(__dirname, "connection-org1.json");



let contract;

// connect to Fabric before starting API
async function initFabric() {
  try {
    const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: "appUser", // make sure 'appUser' exists in wallet
      discovery: { enabled: true, asLocalhost: true },
    });

    const network = await gateway.getNetwork(channelName);
    contract = network.getContract(chaincodeName);

    console.log(
      `✅ Connected to Fabric | channel=${channelName} | cc=${chaincodeName}`
    );
  } catch (err) {
    console.error("❌ Failed to connect to Fabric:", err);
  }
}

// Example route: GET all donations
// app.get("/api/donations", async (req, res) => {
//   try {
//     const result = await contract.evaluateTransaction("GetAllAssets"); // your chaincode function
//     res.json(JSON.parse(result.toString()));
//   } catch (err) {
//     res.status(500).send(err.message);
//   }
// });

app.get("/api/donations", async (req, res) => {
  try {
    const result = await contract.evaluateTransaction("GetAllAssets");
    // result may be empty, so we provide a default empty array
    const assets = result.length ? JSON.parse(result.toString()) : [];
    res.json(assets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Example route: POST a new donation
// app.post("/api/donations", async (req, res) => {
//   try {
//     const { id, value } = req.body;
//     await contract.submitTransaction("CreateAsset", id, value); // your chaincode function
//     res.json({ success: true, id, value });
//   } catch (err) {
//     res.status(500).send(err.message);
//   }
// });

// POST a new donation
app.post("/api/donations", async (req, res) => {
  try {
    const { ID, Color, Size, Owner, AppraisedValue } = req.body;

    if (!ID || !Color || !Size || !Owner || !AppraisedValue) {
      return res.status(400).json({ error: "Missing fields in request body" });
    }

    // Submit CreateAsset transaction
    await contract.submitTransaction(
      "CreateAsset",
      ID,
      Color,
      Size.toString(),
      Owner,
      AppraisedValue.toString()
    );

    // Read the asset back to return in response
    const result = await contract.evaluateTransaction("ReadAsset", ID);
    const assetResult = result && result.length ? JSON.parse(result.toString()) : null;

    res.json({
      message: `Donation ${ID} created successfully`,
      asset: assetResult
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});






// Start server after initializing Fabric
// const PORT = 3000;
// app.listen(PORT, async () => {
//   console.log(`🚀 Backend listening on http://localhost:${PORT}`);
//   await initFabric();
// });
const PORT = 3000;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Backend listening on http://192.168.254.106:${PORT}`);
  await initFabric();
});



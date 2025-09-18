// ------------------- Imports -------------------
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Gateway, Wallets } from "fabric-network";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

import userRoutes from "./routes/userRoutes.js";

// ------------------- Fix __dirname for ESM -------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------- Express Setup -------------------
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:8100", "http://192.168.254.106:8100"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// ------------------- MongoDB Connection -------------------
mongoose
  .connect("mongodb://127.0.0.1:27017/donationsDB")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------- MongoDB Schemas -------------------
const donationOffchainSchema = new mongoose.Schema({
  itemID: { type: String, required: true, unique: true },
  itemType: { type: String, required: true },
  category: { type: String },
  condition: { type: String },
  quantity: { type: Number, default: 1 },
  donorInfo: {
    name: String,
    email: String,
    contactNo: String,
  },
  recipientInfo: {
    school: String,
    contact: String,
  },
  images: { type: [String], default: [] },
  notes: String,
  appraisalValue: Number,
  createdAt: { type: Date, default: Date.now },
});

const Donation = mongoose.model("Donation", donationOffchainSchema);

// ------------------- Hyperledger Fabric Setup -------------------
const channelName = "mychannel";
const chaincodeName = "basic";
const walletPath = path.join(__dirname, "wallet");
const ccpPath = path.join(__dirname, "connection-org1.json");

let contract;

async function initFabric() {
  try {
    const ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: "appUser",
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

// ------------------- API Routes -------------------

// 📌 Get all donations (Blockchain only)
app.get("/api/donations", async (req, res) => {
  try {
    const result = await contract.evaluateTransaction("GetAllAssets");
    let assets = result.length ? JSON.parse(result.toString()) : [];

    assets = assets.filter((asset) => asset.itemID && asset.itemID.trim() !== "");

    res.json(assets);
  } catch (err) {
    console.error("❌ Error fetching donations:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Create a new donation (Blockchain + MongoDB)
app.post("/api/donations", async (req, res) => {
  try {
    const {
      itemType,
      category,
      condition,
      quantity,
      donorID,
      currentOwner,
      status,
      donorInfo,
      recipientInfo,
      notes,
      images,
      appraisalValue,
    } = req.body;

    const itemID = "donation-" + uuidv4();

    if (!itemType || !condition || !donorID || !currentOwner || !status) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const timestamp = new Date().toISOString();

    // --- On-chain ---
    await contract.submitTransaction(
      "CreateAsset",
      itemID,
      itemType,
      condition,
      donorID,
      currentOwner,
      status,
      timestamp
    );

    const result = await contract.evaluateTransaction("ReadAsset", itemID);
    const asset = result.length ? JSON.parse(result.toString()) : null;

    // --- Off-chain ---
    const newDonation = new Donation({
      itemID,
      itemType,
      category,
      condition,
      quantity,
      donorInfo,
      recipientInfo,
      images,
      notes,
      appraisalValue,
    });

    await newDonation.save();

    res.status(201).json({
      message: `✅ Donation ${itemID} created successfully (on-chain + off-chain)`,
      blockchain: asset,
      offchain: newDonation,
    });
  } catch (err) {
    console.error("❌ Error creating donation:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Update donation status (Blockchain only)
app.post("/api/donations/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ error: "Missing status" });

    const timestamp = new Date().toISOString();

    await contract.submitTransaction("UpdateStatus", id, status, timestamp);

    const result = await contract.evaluateTransaction("ReadAsset", id);
    const asset = result.length ? JSON.parse(result.toString()) : null;

    res.json({ message: `✅ Donation ${id} status updated on blockchain`, asset });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📌 Get single donation (Blockchain + MongoDB merged)
app.get("/api/donations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // --- Blockchain ---
    let blockchainData = null;
    try {
      const result = await contract.evaluateTransaction("ReadAsset", id);
      blockchainData = result.length ? JSON.parse(result.toString()) : null;
    } catch (e) {
      console.warn("⚠️ Blockchain record not found for", id);
    }

    // --- Off-chain (MongoDB) ---
    const offchainData = await Donation.findOne({ itemID: id });

    if (!blockchainData && !offchainData) {
      return res.status(404).json({ error: `Donation ${id} not found` });
    }

    res.json({
      blockchain: blockchainData || {},
      offchain: offchainData || {},
    });
  } catch (err) {
    console.error("❌ Error fetching donation details:", err);
    res.status(500).json({ error: err.message });
  }
});

// Use modular routes
app.use("/api/users", userRoutes);

// ------------------- Start Server -------------------
const PORT = 3000;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Backend listening on http://0.0.0.0:${PORT}`);
  await initFabric();
});

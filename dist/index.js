// src/services/aithraService.ts
import {
  Service
} from "@elizaos/core";
import { Connection, Keypair } from "@solana/web3.js";
import { AithraManager } from "@aithranetwork/sdk-aithra-toolkit";
import bs58 from "bs58";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
var AithraService = class extends Service {
  manager;
  connection;
  keypair;
  basePath;
  items = 0;
  constructor() {
    super();
  }
  getBasePath() {
    return this.basePath;
  }
  removeAndCreateAssetsFolder() {
    const assetsPath = path.join(this.basePath, "assets");
    fs.rmSync(assetsPath, { recursive: true, force: true });
    fs.mkdirSync(assetsPath, { recursive: true });
    for (const folder of ["audio", "images"]) {
      fs.mkdirSync(path.join(assetsPath, folder), { recursive: true });
    }
  }
  readTrackInfo() {
    const infoPath = path.join(this.basePath, "assets", "info.json");
    if (!fs.existsSync(infoPath)) return [];
    const existingInfo = fs.readFileSync(infoPath, "utf8");
    return JSON.parse(existingInfo);
  }
  writeTrackInfo(trackInfo) {
    const infoPath = path.join(this.basePath, "assets", "info.json");
    fs.writeFileSync(infoPath, JSON.stringify(trackInfo, null, 2));
  }
  createTempFolderStructure() {
    try {
      this.removeAndCreateAssetsFolder();
    } catch (err) {
      console.error("Failed to create assets folder structure:", err);
    }
  }
  static get serviceType() {
    return "aithra_toolkit";
  }
  async initialize(runtime, basePath) {
    this.connection = new Connection(
      runtime.getSetting("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com",
      "confirmed"
    );
    const privateKey = runtime.getSetting("AITHRA_PRIVATE_KEY");
    if (!privateKey) {
      throw new Error(
        "AITHRA_PRIVATE_KEY environment variable is required"
      );
    }
    this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    this.manager = new AithraManager({
      connection: this.connection,
      keypair: this.keypair,
      priorityFee: Number(runtime.getSetting("AITHRA_PRIORITY_FEE")) || Number(process.env.AITHRA_PRIORITY_FEE) || 0
    });
    this.basePath = path.resolve(
      basePath || path.join(os.tmpdir(), "aithra-temp")
    );
    this.createTempFolderStructure();
  }
  async buildUploadMintMusicNFTs(params) {
    try {
      const result = await this.manager.buildUploadMintMusicNFTs({
        folderPath: path.join(this.basePath, "assets"),
        ...params
      });
      fs.rmSync(path.join(this.basePath, "assets"), {
        recursive: true,
        force: true
      });
      return result;
    } catch (error) {
      console.error("Failed to upload music NFTs:", error);
      throw error;
    }
  }
  storeBufferToFile(buffer, subFolder, fileName) {
    const filePath = path.join(
      this.basePath,
      "assets",
      subFolder,
      fileName
    );
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
  saveTrackData(trackData, trackMetadata, trackNumber) {
    this.storeBufferToFile(trackData, "audio", `track${trackNumber}.mp3`);
    let trackInfo = this.readTrackInfo();
    trackInfo.push({
      [`track${trackNumber}`]: { metadata: trackMetadata }
    });
    this.writeTrackInfo(trackInfo);
  }
  storeTrackToFolder(params) {
    this.items += 1;
    this.saveTrackData(
      params.track.data,
      params.track.metadata,
      this.items
    );
    if (params.track.image) {
      this.storeBufferToFile(
        params.track.image,
        "images",
        `track${this.items}_cover.jpg`
      );
    }
  }
  storeTracksToFolder(params) {
    for (let i = 0; i < params.tracks.length; i++) {
      this.storeTrackToFolder({
        track: params.tracks[i]
      });
    }
  }
  storeAnimationToFolder(params) {
    return this.storeBufferToFile(
      params.animation,
      "",
      `animation.${params.extension || "png"}`
    );
  }
};

// src/plugins/aithraToolkitPlugin.ts
var aithraToolkitPlugin = {
  name: "aithra-toolkit",
  description: "A simple toolkit enabling agents to tokenize any data with a few lines of code",
  actions: [],
  providers: [],
  evaluators: [],
  services: [new AithraService()],
  clients: []
};

// src/index.ts
export * from "@aithranetwork/sdk-aithra-toolkit";
var index_default = aithraToolkitPlugin;
export {
  AithraService,
  aithraToolkitPlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map
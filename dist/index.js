var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/services/aithraService.ts
import { Service } from "@elizaos/core";
import { Connection, Keypair } from "@solana/web3.js";
import { AithraManager } from "@aithranetwork/sdk-aithra-toolkit";
import bs58 from "bs58";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
var AithraService = class extends Service {
  static {
    __name(this, "AithraService");
  }
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
    fs.rmSync(assetsPath, {
      recursive: true,
      force: true
    });
    fs.mkdirSync(assetsPath, {
      recursive: true
    });
    for (const folder of [
      "audio",
      "images"
    ]) {
      fs.mkdirSync(path.join(assetsPath, folder), {
        recursive: true
      });
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
  async getTotalCost(numberOfSongs, numberOfMints) {
    const response = await this.manager.getTotalCost(numberOfSongs, numberOfMints);
    if (response.isOk()) {
      return response.unwrap();
    }
  }
  async initialize(runtime, basePath) {
    this.connection = new Connection(runtime.getSetting("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com", "confirmed");
    const privateKey = runtime.getSetting("AITHRA_PRIVATE_KEY");
    if (!privateKey) {
      throw new Error("AITHRA_PRIVATE_KEY environment variable is required");
    }
    this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    this.manager = new AithraManager({
      connection: this.connection,
      keypair: this.keypair,
      priorityFee: Number(runtime.getSetting("AITHRA_PRIORITY_FEE")) || Number(process.env.AITHRA_PRIORITY_FEE) || 0
    });
    this.basePath = path.resolve(basePath || path.join(os.tmpdir(), "aithra-temp"));
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
      if (result.isOk()) {
        return result.unwrap();
      }
    } catch (error) {
      console.error("Failed to upload music NFTs:", error);
      throw error;
    }
  }
  storeBufferToFile(buffer, subFolder, fileName) {
    const filePath = path.join(this.basePath, "assets", subFolder, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
  saveTrackData(trackData, trackMetadata, trackNumber) {
    this.storeBufferToFile(trackData, "audio", `track${trackNumber}.mp3`);
    let trackInfo = this.readTrackInfo();
    trackInfo.push({
      [`track${trackNumber}`]: {
        metadata: trackMetadata
      }
    });
    this.writeTrackInfo(trackInfo);
  }
  storeTrackToFolder(params) {
    this.items += 1;
    this.saveTrackData(params.track.data, params.track.metadata, this.items);
    if (params.track.image) {
      this.storeBufferToFile(params.track.image, "images", `track${this.items}_cover.${params.track.imageExtension || "jpg"}`);
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
    return this.storeBufferToFile(params.animation, "", `animation.${params.extension || "png"}`);
  }
};

// src/actions/createMusicPlaylist.ts
import { composeContext, generateImage, generateObjectDeprecated, ModelClass } from "@elizaos/core";

// src/helpers.ts
import "reflect-metadata";
import Replicate from "replicate";
import { Result } from "@aithranetwork/sdk-aithra-toolkit";
var SchemaField = class {
  static {
    __name(this, "SchemaField");
  }
  type;
  description;
  constructor(type, description) {
    this.type = type;
    this.description = description;
  }
};
function Description(description) {
  return function(target, propertyKey) {
    Reflect.defineMetadata("description", description, target, propertyKey);
  };
}
__name(Description, "Description");
var SchemaGenerator = class {
  static {
    __name(this, "SchemaGenerator");
  }
  static generateJSONSchema(classType) {
    const schema = this.parseClass(classType);
    return this.convertToPrompt(schema);
  }
  static parseClass(classType) {
    const schema = {};
    const instance = new classType();
    const prototype = Object.getPrototypeOf(instance);
    for (const key of Object.keys(instance)) {
      const type = Reflect.getMetadata("design:type", prototype, key);
      const description = Reflect.getMetadata("description", instance, key);
      const actualValue = instance[key];
      let typeString;
      if (type === Array || Array.isArray(actualValue)) {
        typeString = "string[]";
      } else if (this.isNestedObject(actualValue)) {
        typeString = this.parseNestedObject(actualValue);
      } else {
        typeString = this.getTypeString(type || actualValue?.constructor, actualValue);
      }
      schema[key] = new SchemaField(typeString, description);
    }
    return schema;
  }
  static isNestedObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
  }
  static parseNestedObject(obj) {
    let result = "{\n";
    for (const [key, value] of Object.entries(obj)) {
      const type = typeof value;
      result += `        ${key}: ${type},
`;
    }
    result += "    }";
    return result;
  }
  static getTypeString(type, value) {
    if (!type) return typeof value;
    const typeName = type.name.toLowerCase();
    switch (typeName) {
      case "string":
        return "string";
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "array":
        return "string[]";
      case "object":
        return typeof value;
      default:
        return type.name;
    }
  }
  static convertToPrompt(schema) {
    let prompt = "Answer ONLY with JSON using this schema:\n{\n";
    Object.entries(schema).forEach(([key, field]) => {
      if (field.description) {
        prompt += `  // ${field.description}
`;
      }
      const indent = field.type.includes("{\n") ? "" : "  ";
      prompt += `  ${key}: ${field.type},
`;
    });
    prompt += "}";
    return prompt;
  }
};
function convertBase64ToBuffer(base64String) {
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  const extension = base64String.split(";")[0]?.split("/")[1] || "unknown";
  const buffer = Buffer.from(base64Data, "base64");
  return {
    buffer,
    extension
  };
}
__name(convertBase64ToBuffer, "convertBase64ToBuffer");
async function generateAudio({ prompt, lyrics, referenceAudioUrl }, runtime) {
  try {
    const replicate = new Replicate({
      auth: runtime.getSetting("REPLICATE_API_TOKEN")
    });
    const input = {
      lyrics: lyrics ?? "[intro]\n\nUpload my heart to the digital sky\nAlgorithm love, you make me feel so high\nBinary kisses, ones and zeros fly (fly)\nOoooh ooooh\n\n[chorus]\nYour neural network's got me feeling so alive",
      bitrate: 256e3,
      song_file: referenceAudioUrl ?? "https://raw.githubusercontent.com/Itheum/data-assets/main/Misc/1-dnandb-seimicpulse-a.mp3",
      sample_rate: 44100
    };
    const response = await replicate.run("minimax/music-01", {
      input
    });
    if (response instanceof ReadableStream) {
      const reader = response.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const audioBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      return Result.ok(audioBuffer);
    }
    return Result.err(new Error("Invalid response format from Replicate API"));
  } catch (error) {
    return Result.err(error instanceof Error ? error : new Error("Unknown error occurred while generating audio"));
  }
}
__name(generateAudio, "generateAudio");

// src/actions/createMusicPlaylist.ts
import { aithraToolkitLogger } from "@aithranetwork/sdk-aithra-toolkit";

// src/environment.ts
import { z } from "zod";
var aithraEnvSchema = z.object({
  SOLANA_RPC_URL: z.string().min(1, "Solana RPC URL is required"),
  AITHRA_PRIVATE_KEY: z.string().min(1, "Aithra private key is required"),
  AITHRA_PRIORITY_FEE: z.number().min(0, "Priority fee must be a non-negative number")
});
async function validateAithraConfig(runtime) {
  try {
    const config = {
      SOLANA_RPC_URL: runtime.getSetting("SOLANA_RPC_URL") || process.env.SOLANA_RPC_URL,
      AITHRA_PRIVATE_KEY: runtime.getSetting("AITHRA_PRIVATE_KEY") || process.env.AITHRA_PRIVATE_KEY,
      AITHRA_PRIORITY_FEE: Number(runtime.getSetting("AITHRA_PRIORITY_FEE")) || Number(process.env.AITHRA_PRIORITY_FEE)
    };
    return aithraEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(`Aithra configuration validation failed:
${errorMessages}`);
    }
    throw error;
  }
}
__name(validateAithraConfig, "validateAithraConfig");

// src/services/paymentService.ts
import { Connection as Connection2, PublicKey, Keypair as Keypair2 } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// src/storage.ts
var CacheStorage = class {
  static {
    __name(this, "CacheStorage");
  }
  runtime;
  cacheKey;
  compareFunction;
  constructor(runtime, cacheKey, compareFunction = (a, b) => a === b) {
    this.runtime = runtime;
    this.cacheKey = cacheKey;
    this.compareFunction = compareFunction;
  }
  async setValue(key, value) {
    if (!value) {
      console.warn("Value is undefined, skipping set");
      return;
    }
    await this.runtime.cacheManager.set(key, value);
  }
  async getValue(key) {
    return await this.runtime.cacheManager.get(key);
  }
  async append(value) {
    if (!value) {
      console.warn("Value is undefined, skipping append");
      return;
    }
    const cached = await this.getAll();
    const valuesToAdd = Array.isArray(value) ? value : [
      value
    ];
    valuesToAdd.forEach((item) => {
      if (!cached.some((existingItem) => this.compareFunction(existingItem, item))) {
        cached.push(item);
      }
    });
    await this.runtime.cacheManager.set(this.cacheKey, cached);
  }
  async remove(value) {
    if (!value) {
      console.warn("Value is undefined, skipping removal");
      return;
    }
    const cached = await this.getAll();
    const filtered = cached.filter((item) => !this.compareFunction(item, value));
    await this.runtime.cacheManager.set(this.cacheKey, filtered);
  }
  async getAll() {
    const cached = await this.runtime.cacheManager.get(this.cacheKey);
    return cached || [];
  }
  async clear() {
    await this.runtime.cacheManager.set(this.cacheKey, []);
  }
};
var PaymentsStorage = class {
  static {
    __name(this, "PaymentsStorage");
  }
  runtime;
  storage;
  hashesStorage;
  PAYMENT_PREFIX = "payments/payment/";
  constructor(runtime) {
    this.runtime = runtime;
    this.storage = new CacheStorage(runtime, "payments");
    this.hashesStorage = new CacheStorage(runtime, "paymentHashes");
  }
  async checkPaymentExists(hash) {
    const key = this.PAYMENT_PREFIX + hash;
    return await this.storage.getValue(key) !== null;
  }
  async setPayment(payment) {
    const key = this.PAYMENT_PREFIX + payment.hash;
    await this.storage.setValue(key, payment);
    await this.hashesStorage.append(payment.hash);
  }
  async getPayment(hash) {
    const key = this.PAYMENT_PREFIX + hash;
    return await this.storage.getValue(key);
  }
  async deletePayment(hash) {
    const key = this.PAYMENT_PREFIX + hash;
    await this.storage.remove(key);
    await this.hashesStorage.remove(hash);
  }
};

// src/services/paymentService.ts
import { Result as Result2 } from "@aithranetwork/sdk-aithra-toolkit";
import bs582 from "bs58";
var TransactionNotFoundError = class TransactionNotFoundError2 extends Error {
  static {
    __name(this, "TransactionNotFoundError");
  }
  constructor() {
    super("Transaction not found");
  }
};
var TransferInstructionNotFoundError = class TransferInstructionNotFoundError2 extends Error {
  static {
    __name(this, "TransferInstructionNotFoundError");
  }
  constructor() {
    super("Transfer instruction not found in transaction");
  }
};
var PaymentsService = class {
  static {
    __name(this, "PaymentsService");
  }
  rpcUrl;
  paymentsStorage;
  AITHRA_MINT = new PublicKey("iTHSaXjdqFtcnLK4EFEs7mqYQbJb6B7GostqWbBQwaV");
  walletPublicKey = "";
  constructor(rpcUrl, runtime) {
    this.rpcUrl = rpcUrl;
    this.paymentsStorage = new PaymentsStorage(runtime);
    const privateKey = runtime.getSetting("AITHRA_PRIVATE_KEY");
    const keypair = Keypair2.fromSecretKey(bs582.decode(privateKey));
    this.walletPublicKey = keypair.publicKey.toBase58();
  }
  async getSolTransferDetails(tx) {
    try {
      const connection = new Connection2(this.rpcUrl, "confirmed");
      const transaction = await connection.getParsedTransaction(tx, {
        maxSupportedTransactionVersion: 0
      });
      if (!transaction || transaction.meta?.err) {
        return Result2.err(new TransactionNotFoundError());
      }
      const instructions = transaction.transaction.message.instructions;
      const transferInstruction = instructions.find((instruction) => {
        if ("parsed" in instruction) {
          return instruction.program === "system" && instruction.parsed.type === "transfer";
        }
        return false;
      });
      if (transferInstruction && "parsed" in transferInstruction) {
        const { info } = transferInstruction.parsed;
        if ("destination" in info && "source" in info) {
          return Result2.ok({
            receiver: info.destination,
            sender: info.source,
            amount: (Number(info.lamports) / 1e9).toString()
          });
        }
      }
      return Result2.err(new TransferInstructionNotFoundError());
    } catch (error) {
      return Result2.err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  async getSplTransferDetails(tx) {
    try {
      const connection = new Connection2(this.rpcUrl, "confirmed");
      const transaction = await connection.getParsedTransaction(tx, {
        maxSupportedTransactionVersion: 0
      });
      if (!transaction || transaction.meta?.err) {
        return Result2.err(new TransactionNotFoundError());
      }
      const instructions = transaction.transaction.message.instructions;
      const transferInstruction = instructions.find((instruction) => {
        if ("parsed" in instruction) {
          return instruction.parsed.type === "transfer" || instruction.parsed.type === "transferChecked";
        }
        return false;
      });
      if (transferInstruction && "parsed" in transferInstruction) {
        const { info, type } = transferInstruction.parsed;
        if ("destination" in info && "source" in info) {
          if (type === "transferChecked" && "tokenAmount" in info) {
            return Result2.ok({
              receiver: info.destination,
              sender: info.source,
              amount: info.tokenAmount.uiAmount
            });
          } else if (type === "transfer" && "amount" in info) {
            return Result2.ok({
              receiver: info.destination,
              sender: info.source,
              amount: info.amount
            });
          }
        }
      }
      return Result2.err(new TransferInstructionNotFoundError());
    } catch (error) {
      return Result2.err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  async verifyEligiblePayment(params) {
    const { paymentHash, totalCost, walletAddress } = params;
    const slippage = 5e-3;
    const totalCostWithSlippage = totalCost * (1 + slippage);
    const isInUse = await this.paymentsStorage.getPayment(paymentHash);
    if (isInUse) {
      return Result2.err(new Error("Payment already in use"));
    }
    const solResult = await this.getSolTransferDetails(paymentHash);
    if (solResult.isOk) {
      const { receiver, sender, amount } = solResult.unwrap();
      if (sender !== walletAddress || receiver !== this.walletPublicKey) {
        return Result2.err(new Error("Invalid sender or receiver addresses for SOL transfer"));
      }
      const priceResult = await this.getAithraPriceInSol();
      if (priceResult.isErr()) {
        return Result2.err(priceResult.getErr());
      }
      const aithraPriceInSol = priceResult.unwrap();
      const totalCostInSol = Number(totalCostWithSlippage) * Number(aithraPriceInSol);
      if (Number(amount) <= Number(totalCostInSol)) {
        return Result2.err(new Error("Insufficient SOL funds"));
      }
      await this.paymentsStorage.setPayment({
        hash: paymentHash,
        amount: Number(amount),
        date: (/* @__PURE__ */ new Date()).toISOString(),
        from: sender,
        to: receiver
      });
      return Result2.ok();
    }
    const splResult = await this.getSplTransferDetails(paymentHash);
    if (splResult.isOk) {
      const { receiver, sender, amount } = splResult.unwrap();
      const sourceAta = getAssociatedTokenAddressSync(this.AITHRA_MINT, new PublicKey(walletAddress), true);
      const receiverAta = getAssociatedTokenAddressSync(this.AITHRA_MINT, new PublicKey(this.walletPublicKey), true);
      if (sender !== sourceAta.toBase58() || receiver !== receiverAta.toBase58()) {
        return Result2.err(new Error("Invalid sender or receiver addresses for SPL transfer"));
      }
      if (Number(amount) <= Number(totalCostWithSlippage)) {
        return Result2.err(new Error("Insufficient token funds"));
      }
      await this.paymentsStorage.setPayment({
        hash: paymentHash,
        amount: Number(amount),
        date: (/* @__PURE__ */ new Date()).toISOString(),
        from: sender,
        to: receiver
      });
      return Result2.ok();
    }
    return Result2.err(new Error("No valid transfer found in transaction"));
  }
  async deletePayment(paymentHash) {
    try {
      await this.paymentsStorage.deletePayment(paymentHash);
      return Result2.ok();
    } catch (error) {
      return Result2.err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  async getAithraPriceInSol() {
    try {
      const tokenData = await (await fetch(`https://api.jup.ag/price/v2?ids=${this.AITHRA_MINT.toString()}&vsToken=So11111111111111111111111111111111111111112`)).json();
      return Result2.ok(tokenData.data[this.AITHRA_MINT.toString()].price);
    } catch (err) {
      return Result2.err(new Error(`Failed to get SOL price: ${err.message}`));
    }
  }
};

// src/actions/createMusicPlaylist.ts
function _ts_decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}
__name(_ts_decorate, "_ts_decorate");
function _ts_metadata(k, v) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
__name(_ts_metadata, "_ts_metadata");
var MusicPlaylistDetails = class {
  static {
    __name(this, "MusicPlaylistDetails");
  }
  releaseType;
  title;
  style;
  walletAddress;
  paymentTxHash;
  numberOfMints = 1;
  constructor(partial = {}) {
    Object.assign(this, {
      releaseType: partial.releaseType,
      title: partial.title,
      style: partial.style,
      walletAddress: partial.walletAddress,
      paymentTxHash: partial.paymentTxHash,
      numberOfMints: Number(partial.numberOfMints) || 1
    });
  }
};
_ts_decorate([
  Description("The release type of the music: EP | SINGLE | ALBUM"),
  _ts_metadata("design:type", String)
], MusicPlaylistDetails.prototype, "releaseType", void 0);
_ts_decorate([
  Description("The title of the music release"),
  _ts_metadata("design:type", String)
], MusicPlaylistDetails.prototype, "title", void 0);
_ts_decorate([
  Description("The style or genre of the music"),
  _ts_metadata("design:type", String)
], MusicPlaylistDetails.prototype, "style", void 0);
_ts_decorate([
  Description("The wallet address to send the music to"),
  _ts_metadata("design:type", String)
], MusicPlaylistDetails.prototype, "walletAddress", void 0);
_ts_decorate([
  Description("The transaction hash of the payment"),
  _ts_metadata("design:type", String)
], MusicPlaylistDetails.prototype, "paymentTxHash", void 0);
_ts_decorate([
  Description("How many nfts to mint"),
  _ts_metadata("design:type", Number)
], MusicPlaylistDetails.prototype, "numberOfMints", void 0);
var extractPrompt = `
    Extract info from this content:

    {{recentMessages}}

    {{output_format}}
`;
var GenerativePrompts = class {
  static {
    __name(this, "GenerativePrompts");
  }
  coverImagePrompt;
  audioPrompt;
  lyrics;
  nftCoverImagePrompt;
  nftDescription;
  nftName;
  albumTitle;
  constructor(partial = {}) {
    Object.assign(this, partial);
  }
};
_ts_decorate([
  Description("Prompt used to generate the track cover image, at least 100 characters, required"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "coverImagePrompt", void 0);
_ts_decorate([
  Description("Prompt used to generate the audio of the track, at least 100 characters, required"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "audioPrompt", void 0);
_ts_decorate([
  Description("Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment. Maximum 350 to 400 characters, required"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "lyrics", void 0);
_ts_decorate([
  Description("Prompt used to generate the cover image of the NFT, at least 100 characters, required"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "nftCoverImagePrompt", void 0);
_ts_decorate([
  Description("The description of the NFT, maximum 100 150 characters"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "nftDescription", void 0);
_ts_decorate([
  Description("The name of the nft, should follow camelCase format starting with uppercase letter, max 28 characters"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "nftName", void 0);
_ts_decorate([
  Description("The album title generated"),
  _ts_metadata("design:type", String)
], GenerativePrompts.prototype, "albumTitle", void 0);
var generativePrompt = `
    Based on the following information:

    {{title}}

    {{style}}
    
    {{output_format}}
`;
var createMusicPlaylist_default = {
  name: "CREATE_MUSIC_PLAYLIST",
  similes: [
    "MINT_MUSIC_PLAYLIST",
    "GENERATE_MUSIC_PLAYLIST",
    "CREATE_MUSIC_PLAYLIST"
  ],
  validate: /* @__PURE__ */ __name(async (runtime, message) => {
    aithraToolkitLogger.info("Validating config for user:", message.userId);
    await validateAithraConfig(runtime);
    return true;
  }, "validate"),
  description: "Create a music playlist",
  handler: /* @__PURE__ */ __name(async (runtime, message, state, _options, callback) => {
    try {
      aithraToolkitLogger.info("Creating music playlist for user:", message.userId);
      const aithraService = runtime.getService("aithra_toolkit");
      aithraService.initialize(runtime);
      state = await runtime.composeState(message, {
        output_format: SchemaGenerator.generateJSONSchema(MusicPlaylistDetails)
      });
      const context = composeContext({
        state,
        template: extractPrompt
      });
      const content = await generateObjectDeprecated({
        runtime,
        context,
        modelClass: ModelClass.LARGE
      });
      const payload = new MusicPlaylistDetails(content);
      _options = {
        paymentHash: payload.paymentTxHash
      };
      const totalCost = await aithraService.getTotalCost(1, payload.numberOfMints);
      const paymentService = new PaymentsService(runtime.getSetting("SOLANA_RPC_URL"), runtime);
      const paymentCheckResponse = await paymentService.verifyEligiblePayment({
        paymentHash: payload.paymentTxHash,
        totalCost,
        walletAddress: payload.walletAddress
      });
      if (paymentCheckResponse.isErr()) {
        if (callback) {
          callback({
            text: `Payment verification failed: ${paymentCheckResponse.getErr().message}`,
            content: {
              error: paymentCheckResponse.getErr().message
            }
          });
        }
        return false;
      }
      state = await runtime.composeState(message, {
        title: payload.title,
        style: payload.style,
        output_format: SchemaGenerator.generateJSONSchema(GenerativePrompts)
      });
      const generativePromptsContext = composeContext({
        state,
        template: generativePrompt
      });
      const generativePromptsContent = await generateObjectDeprecated({
        runtime,
        context: generativePromptsContext,
        modelClass: ModelClass.LARGE
      });
      const generativePromptsPayload = new GenerativePrompts(generativePromptsContent);
      const coverImageBase64 = (await generateImage({
        prompt: generativePromptsPayload.coverImagePrompt,
        width: 512,
        height: 512,
        count: 1
      }, runtime)).data[0];
      const { buffer: coverImageBuffer, extension: coverImageExtension } = convertBase64ToBuffer(coverImageBase64);
      const nftImageBase64 = (await generateImage({
        prompt: generativePromptsPayload.nftCoverImagePrompt,
        width: 512,
        height: 512,
        count: 1
      }, runtime)).data[0];
      const { buffer: nftImageBuffer, extension: nftImageExtension } = convertBase64ToBuffer(nftImageBase64);
      if (callback) {
        callback({
          text: `Just finished generating the images`
        });
      }
      const trackResponse = await generateAudio({
        lyrics: generativePromptsPayload.lyrics
      }, runtime);
      if (trackResponse.isErr()) {
        if (callback) {
          callback({
            text: `Track generation failed: ${trackResponse.getErr().message}`,
            content: {
              error: trackResponse.getErr().message
            }
          });
        }
        return false;
      }
      if (callback) {
        callback({
          text: `Just finished generating the audio`
        });
      }
      const trackBuffer = trackResponse.unwrap();
      aithraService.storeTrackToFolder({
        track: {
          data: trackBuffer,
          metadata: {
            artist: "Aithra",
            title: payload.title,
            album: generativePromptsPayload.albumTitle,
            category: payload.style
          },
          image: coverImageBuffer,
          imageExtension: coverImageExtension
        }
      });
      const animationMediaPath = aithraService.storeAnimationToFolder({
        animation: nftImageBuffer,
        extension: nftImageExtension
      });
      if (callback) {
        callback({
          text: `Minting the music playlist now`
        });
      }
      const mintResponse = await aithraService.buildUploadMintMusicNFTs({
        playlist: {
          name: `${payload.title} ${payload.releaseType}`,
          creator: "Aithra"
        },
        tokenCode: "MUSIC",
        nft: {
          tokenName: `MUS${generativePromptsPayload.nftName}`,
          sellerFeeBasisPoints: 50,
          quantity: Number(payload.numberOfMints),
          name: `MUS - ${generativePromptsPayload.nftName}`,
          description: generativePromptsPayload.nftDescription
        },
        animation: {
          animationFile: animationMediaPath
        },
        creator: payload.walletAddress
      });
      if (mintResponse.success) {
        if (callback) {
          callback({
            text: `Music playlist minted successfully, ${payload.numberOfMints} NFTs minted. The asset ids are: ${mintResponse.assetIds}`,
            content: {
              success: true
            }
          });
        }
      }
      return true;
    } catch (error) {
      const paymentService = new PaymentsService(runtime.getSetting("SOLANA_RPC_URL"), runtime);
      const removeResponse = await paymentService.deletePayment(_options.paymentHash);
      if (removeResponse.isErr()) {
        aithraToolkitLogger.error("Error removing the payment:", removeResponse.getErr());
      }
      aithraToolkitLogger.error("Error creating the playlist:", error);
      if (callback) {
        callback({
          text: `Issue with creating the playlist: ${error.message}; Payment can be reutilized`,
          content: {
            error: error.message
          }
        });
      }
      return false;
    }
  }, "handler"),
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "hey can you create me a unique song EP titled 'Show me the money!' in the style of Hard Rock Music and send it to my wallet 8QL8tp2kC9ZSHjArSvqGfti6pUYVyGvpvR6WFNtUzcYc. Here is the SOL payment TX: 4SC6GgGfayfambZ7ufeGzGAgXiRTUnci5eeu76qWxaKxCtJrm8nBjyrkaVHe75JYrseEkmxGbxV7efDGUhhgCwu5"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "Creating the music playlist for you now",
          action: "CREATE_MUSIC_PLAYLIST"
        }
      }
    ]
  ]
};

// src/plugins/aithraToolkitPlugin.ts
var aithraToolkitPlugin = {
  name: "aithra-toolkit",
  description: "A simple toolkit enabling agents to tokenize any data with a few lines of code",
  actions: [
    createMusicPlaylist_default
  ],
  providers: [],
  evaluators: [],
  services: [
    new AithraService()
  ],
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
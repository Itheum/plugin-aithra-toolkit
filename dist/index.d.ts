import { Plugin, Service, ServiceType, IAgentRuntime } from '@elizaos/core';
import { BuildMusicNFTResult } from '@aithranetwork/sdk-aithra-toolkit';
export * from '@aithranetwork/sdk-aithra-toolkit';

declare const aithraToolkitPlugin: Plugin;

declare class AithraService extends Service {
    private manager;
    private connection;
    private keypair;
    private basePath;
    private items;
    constructor();
    getBasePath(): string;
    private removeAndCreateAssetsFolder;
    private readTrackInfo;
    private writeTrackInfo;
    private createTempFolderStructure;
    static get serviceType(): ServiceType;
    getTotalCost(numberOfSongs: number, numberOfMints: number): Promise<number>;
    initialize(runtime: IAgentRuntime, basePath?: string): Promise<void>;
    buildUploadMintMusicNFTs(params: {
        playlist: {
            name: string;
            creator: string;
        };
        tokenCode: "MUSIC";
        nft: {
            tokenName: string;
            sellerFeeBasisPoints: number;
            quantity: number;
            name: string;
            description: string;
        };
        animation: {
            animationFile: string;
        };
        creator?: string;
    }): Promise<BuildMusicNFTResult>;
    private storeBufferToFile;
    private saveTrackData;
    storeTrackToFolder(params: {
        track: {
            data: Buffer;
            metadata: {
                artist: string;
                album: string;
                title: string;
                category: string;
            };
            image: Buffer;
            imageExtension?: string;
        };
    }): void;
    storeTracksToFolder(params: {
        tracks: Array<{
            data: Buffer;
            metadata: {
                artist: string;
                album: string;
                title: string;
                category: string;
            };
            image: Buffer;
        }>;
    }): void;
    storeAnimationToFolder(params: {
        animation: Buffer;
        extension?: string;
    }): string;
}

export { AithraService, aithraToolkitPlugin, aithraToolkitPlugin as default };

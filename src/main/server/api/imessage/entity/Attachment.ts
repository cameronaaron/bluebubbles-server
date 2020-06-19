import * as fs from "fs";
import * as path from "path";
import * as base64 from "byte-base64";
import * as Jimp from "jimp";
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from "typeorm";

import { BooleanTransformer } from "@server/api/transformers/BooleanTransformer";
import { DateTransformer } from "@server/api/transformers/DateTransformer";
import { Message } from "@server/api/imessage/entity/Message";
import { getBlurHash } from "@server/api/imessage/helpers/utils";
import { AttachmentResponse } from "@server/types";

@Entity("attachment")
export class Attachment {
    @PrimaryGeneratedColumn({ name: "ROWID" })
    ROWID: number;

    @ManyToMany(type => Message)
    @JoinTable({
        name: "message_attachment_join",
        joinColumns: [{ name: "attachment_id" }],
        inverseJoinColumns: [{ name: "message_id" }]
    })
    messages: Message[];

    @Column({ type: "text", nullable: false })
    guid: string;

    @Column({
        type: "integer",
        name: "created_date",
        default: 0,
        transformer: DateTransformer
    })
    createdDate: Date;

    @Column({
        type: "integer",
        name: "start_date",
        default: 0,
        transformer: DateTransformer
    })
    startDate: Date;

    @Column({ type: "text", name: "filename", nullable: false })
    filePath: string;

    @Column({ type: "text", nullable: false })
    uti: string;

    @Column({ type: "text", name: "mime_type", nullable: true })
    mimeType: string;

    @Column({ type: "integer", name: "transfer_state", default: 0 })
    transferState: number;

    @Column({
        type: "integer",
        name: "is_outgoing",
        default: 0,
        transformer: BooleanTransformer
    })
    isOutgoing: boolean;

    @Column({ type: "blob", name: "user_info", nullable: true })
    userInfo: Blob;

    @Column({ type: "text", name: "transfer_name", nullable: false })
    transferName: string;

    @Column({ type: "integer", name: "total_bytes", default: 0 })
    totalBytes: number;

    @Column({
        type: "integer",
        name: "is_sticker",
        default: 0,
        transformer: BooleanTransformer
    })
    isSticker: boolean;

    @Column({ type: "blob", name: "sticker_user_info", nullable: true })
    stickerUserInfo: Blob;

    @Column({ type: "blob", name: "attribution_info", nullable: true })
    attributionInfo: Blob;

    @Column({
        type: "integer",
        name: "hide_attachment",
        default: 0,
        transformer: BooleanTransformer
    })
    hideAttachment: boolean;
}

const handledImageMimes = ["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/tiff", "image/gif"];
export const getAttachmentResponse = async (
    tableData: Attachment,
    withData = false,
    withBlurhash = true
): Promise<AttachmentResponse> => {
    let data: Uint8Array | string = null;
    let blurhash: string = null;
    let image: Jimp = null;

    // Get the fully qualified path
    let fPath = tableData.filePath;
    if (fPath[0] === "~") {
        fPath = path.join(process.env.HOME, fPath.slice(1));
    }

    try {
        // Try to read the file
        const fopen = fs.readFileSync(fPath);

        // If we want data, get the data
        if (withData) {
            data = Uint8Array.from(fopen);
        }

        if (handledImageMimes.includes(tableData.mimeType)) {
            image = await Jimp.read(fPath);
            if (withBlurhash) {
                const now = new Date().getTime();
                blurhash = await getBlurHash(image);
                const later = new Date().getTime();
                console.log(
                    `Calculated blurhash for image (${image.getHeight()}x${image.getWidth()}) in ${later - now} ms`
                );
            }
        }

        // If there is no data, return null for the data
        // Otherwise, convert it to a base64 string
        if (!data) {
            data = null;
        } else {
            data = base64.bytesToBase64(data as Uint8Array);
        }
    } catch (ex) {
        console.log(ex);
        console.error(`Could not read file [${fPath}]`);
    }

    return {
        guid: tableData.guid,
        messages: tableData.messages ? tableData.messages.map(item => item.guid) : [],
        data: data as string,
        height: image ? image.getHeight() : 0,
        width: image ? image.getWidth() : 0,
        blurhash,
        uti: tableData.uti,
        mimeType: tableData.mimeType,
        transferState: tableData.transferState,
        isOutgoing: tableData.isOutgoing,
        transferName: tableData.transferName,
        totalBytes: tableData.totalBytes,
        isSticker: tableData.isSticker,
        hideAttachment: tableData.hideAttachment
    };
};

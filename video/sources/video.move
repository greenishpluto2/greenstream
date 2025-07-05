/*
/// Module: video
module video::video;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions
module video::video;

use std::ascii::String;
use sui::url::{Self, Url};

public struct Video has key, store {
    id: UID,
    title: String,
    description: String,
    master_manifest_url: Url,
    created_at: u64,
}

public fun save_video(ctx: &mut TxContext, title: String, description: String, master_manifest_url: String) {
    let video = Video {
        id: object::new(ctx),
        title,
        description,
        master_manifest_url: url::new_unsafe(master_manifest_url),
        created_at: tx_context::epoch_timestamp_ms(ctx),
    };

    transfer::share_object(video);
}

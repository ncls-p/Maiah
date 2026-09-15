/** AWS event-stream frames with valid prelude and message CRCs. */
export function bedrockEvents(events: Record<string, unknown>[]) {
  const crc = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  return Buffer.concat(
    events.map((event) => {
      const [type, body] = Object.entries(event)[0];
      const headers = Buffer.concat(
        Object.entries({
          ":event-type": type,
          ":message-type": "event",
          ":content-type": "application/json",
        }).map(([name, value]) => {
          const size = Buffer.alloc(2);
          size.writeUInt16BE(Buffer.byteLength(value));
          return Buffer.concat([
            Buffer.from([name.length]),
            Buffer.from(name),
            Buffer.from([7]),
            size,
            Buffer.from(value),
          ]);
        }),
      );
      const payload = Buffer.from(JSON.stringify(body));
      const frame = Buffer.alloc(16 + headers.length + payload.length);
      frame.writeUInt32BE(frame.length, 0);
      frame.writeUInt32BE(headers.length, 4);
      frame.writeUInt32BE(crc(frame.subarray(0, 8)), 8);
      headers.copy(frame, 12);
      payload.copy(frame, 12 + headers.length);
      frame.writeUInt32BE(crc(frame.subarray(0, -4)), frame.length - 4);
      return frame;
    }),
  );
}

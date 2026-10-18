/**
 * Translation into class of reader implementation
 * from:
 * https://tchayen.github.io/posts/ttf-file-parsing
 */
export class Reader {
  position = 0;
  /** @type {Uint8Array} */
  arr;
  /**
   * @param {Uint8Array} u8Arr
   */
  constructor(u8Arr) {
    this.arr = u8Arr;
  }

  u8() {
    return data[this.position++];
  }

  u16() {
    return ((this.u8() << 8) | this.u8()) >>> 0;
  }

  u32() {
    return this.i32() >>> 0;
  }

  i16() {
    let number = this.u16();
    if (number & 0x8000) {
      number -= 1 << 16;
    }
    return number;
  }

  i32() {
    return (this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8();
  }

  /**
   * @param {number} len
   */
  str(len) {
    let string = "";
    for (let i = 0; i < len; i++) {
      string += String.fromCharCode(this.u8());
    }
    return string;
  }

  fword() {
    return this.i16();
  }

  ufword() {
    return this.u16();
  }

  offset16() {
    return this.u16();
  }

  offset32() {
    return this.u32();
  }

  f2dot14() {
    return this.i16() / (1 << 14);
  }

  fixed() {
    return this.i32() / (1 << 16);
  }

  date() {
    const macTime = getUint32() * 0x100000000 + getUint32();
    const utcTime = macTime * 1000 + Date.UTC(1904, 1, 1);
    return new Date(utcTime);
  }
}

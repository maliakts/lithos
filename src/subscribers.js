import fs from 'node:fs';
import path from 'node:path';

export class Subscribers {
  constructor(file) {
    this.file = file;
    this.map = new Map();
    try {
      for (const s of JSON.parse(fs.readFileSync(file, 'utf8'))) this.map.set(s.chatId, s);
    } catch {
      /* dosya yok: boş başla */
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.map.values()], null, 2));
  }
  set(chatId, { minMag = 4, province = '' } = {}) {
    this.map.set(chatId, { chatId, minMag, province });
    this.save();
  }
  remove(chatId) {
    const had = this.map.delete(chatId);
    if (had) this.save();
    return had;
  }
  get(chatId) {
    return this.map.get(chatId);
  }
  all() {
    return [...this.map.values()];
  }
}

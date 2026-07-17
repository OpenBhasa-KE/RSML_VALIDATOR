import { parquetWriteBuffer } from 'hyparquet-writer';
import fs from 'fs';

const audioBytes = Buffer.from('RIFF1234WAVEfmt fake-audio-bytes-for-testing', 'utf8');

const data = {
  audio: ['te-1-1-1.wav', 'te-1-1-2.wav'],
  file: [1, 1],
  segment: [1, 2],
  audio_bytes: [audioBytes, audioBytes],
  verbatim: ['hello world', 'second row'],
};

const buffer = parquetWriteBuffer({
  columnData: Object.entries(data).map(([name, values]) => ({ name, data: values })),
});

fs.writeFileSync('./test.parquet', Buffer.from(buffer));
console.log('wrote test.parquet');

// 这支手机的身份（不用注册）：随机 id + 名字 + 固定房间名
import { load, save } from './storage.js';
import { randomId } from './rng.js';

export function myPid() {
  let pid = load('pid');
  if (!pid) {
    pid = randomId();
    save('pid', pid);
  }
  return pid;
}

export const getName = () => load('name', '');
export const setName = (n) => save('name', n);
export const getSlug = () => load('slug', '');
export const setSlug = (s) => save('slug', s);

// 我开着的房间（房主）：房间状态存在这里
export const hostRoomKey = (code) => `host.${code}`;
export const loadHostRoom = (code) => load(hostRoomKey(code));
export const saveHostRoom = (code, room) => save(hostRoomKey(code), room);

export function myRooms() {
  return load('rooms', []);
}
export function addMyRoom(code, gameId) {
  save('rooms', [{ code, gameId, at: Date.now() }, ...myRooms().filter((r) => r.code !== code)].slice(0, 5));
}
export function removeMyRoom(code) {
  save('rooms', myRooms().filter((r) => r.code !== code));
  saveHostRoom(code, null);
}

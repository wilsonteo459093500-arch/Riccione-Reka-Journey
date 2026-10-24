// 潘吉的声音 · English for the Chinese strings the voice adds (staff settings, the pack voices, the first-person copy).
// The spoken lines themselves are NOT here: they live with both languages in voice-lines.js and the bubble shows
// lineText(id) from voice.js, so caption and voice can never drift apart.
export default {
  // Gemini voices (voice.js GEMINI_TTS.voices — Google's own one-word character)
  青春: 'Youthful',
  轻柔: 'Soft',
  明亮: 'Bright',

  // staff settings (src/studio/ui/SettingsModal.jsx → 潘吉的声音)
  潘吉的声音: 'Pangie’s voice',
  '她用小女生的声音，说出对话泡泡里的那句话。': 'She says the line in her speech bubble, in a little girl’s voice.',
  潘吉说话: 'Pangie speaks',
  她说多少: 'How much she says',
  每一句: 'Every line',
  只在仪式时刻: 'Ritual moments only',
  '只在开场、神灯、翻牌、揭晓、蓝图和告别时说话。': 'She speaks only at the welcome, the lamp, the card flips, the reveal, the blueprint and goodbye.',
  '仪式时刻之外，一路上也会说几句鼓励的话。': 'Beyond the ritual moments, she adds a few encouraging words along the way.',
  中文声音: 'Chinese voice',
  英文声音: 'English voice',
  '自动（推荐）': 'Automatic (recommended)',
  试听: 'Listen',
  '现在是静音，先打开声音。': 'Sound is muted — turn it on first.',
  '这台设备没有这种语言的语音。': 'This device has no voice for this language.',
  '再按一次试听。': 'Tap Listen once more.',
  '先打开上面的「潘吉说话」。': 'Turn on “Pangie speaks” above first.',
  '高级语音包：{0} / {1} 句': 'Premium voice pack: {0} / {1} lines',
  现在用的是这台设备自带的声音: 'Using this device’s built-in voice',
  '高级语音包（Gemini）': 'Premium voice pack (Gemini)',
  '用这台设备上的 Gemini key，把她的每一句台词生成一次更自然的声音，存在本机，没网也能播。':
    'With the Gemini key on this device, render each of her lines once in a more natural voice. The clips stay on this device and play offline.',
  '只发送固定的台词，不含任何客人资料。': 'Only the fixed lines are sent — never anything about a guest.',
  声音: 'Voice',
  语音模型: 'Speech model',
  停止: 'Stop',
  生成语音包: 'Generate voice pack',
  继续生成: 'Continue',
  全部重新生成: 'Regenerate all',
  清除语音包: 'Clear voice pack',
  '清除语音包？': 'Clear the voice pack?',
  '这台设备上生成好的声音会删掉，她会改用设备自带的声音。随时可以再生成。':
    'The clips on this device will be deleted and she’ll use the built-in voice. You can generate them again any time.',
  清除: 'Clear',
  '重新生成语音包？': 'Regenerate the voice pack?',
  '用现在选的声音把每一句重新生成一次，旧的会先删掉。': 'Every line is rendered again in the selected voice; the old clips are deleted first.',
  '这台设备存不了语音包（可能是私密浏览）。': 'This device can’t store a voice pack (private browsing?).',
  '先在上面填好 Gemini API key。': 'Add the Gemini API key above first.',
  // t() keeps the trailing … from the source; keys never include it
  'Gemini 有点忙，{0} 秒后再试': 'Gemini is busy — trying again in {0} s',
  '正在生成 {0} / {1}': 'Generating {0} / {1}',
  '关掉设置也会在后台继续生成。': 'It keeps going if you close Settings.',
  '全部做好了：{0} 句。': 'All done: {0} lines.',
  '{0} 句没成功，再按一次「继续生成」补上。': '{0} lines didn’t come through. Tap “Continue” to fill them in.',
  '今天的免费额度用完了；明天再按「继续生成」，会接着做。': 'Today’s free quota is used up. Tap “Continue” tomorrow and it will pick up where it stopped.',
  'Gemini key 无效或没有权限，请检查上面的 key。': 'The Gemini key is invalid or not allowed. Check the key above.',
  '已停止。再按「继续生成」会接着做。': 'Stopped. Tap “Continue” to pick up where it stopped.',

  // copy that moves to her own first-person voice (flow.js CHAPTERS hints · Blueprint farewell) — caption = voice
  '我只能实现三个愿望哦。': 'I can only grant three wishes.',
  '最后，帮我扫个雷吧。': 'Last one — tell me what you’d never want.',
  '你的梦想，我记住啦。': 'Your dream is safe with me.',
};

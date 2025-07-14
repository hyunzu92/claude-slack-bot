import 'dotenv/config';
import { App } from '@slack/bolt';
import { Anthropic } from '@anthropic-ai/sdk';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN!,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

async function fetchRecentMessages(client: any, limit = 10): Promise<string[]> {
  const channels = await client.conversations.list({
    types: 'public_channel,private_channel,im'
  });

  const allMessages: string[] = [];

  for (const ch of channels.channels) {
    const history = await client.conversations.history({
      channel: ch.id,
      limit
    });

	console.log(`✅ Fetched history for ${ch.name}`);
	await new Promise(r => setTimeout(r, 1000)); // 1초 대기
	
    for (const msg of history.messages) {
      if (msg.text) {
        allMessages.push(`[${ch.name || 'DM'}] ${msg.user}: ${msg.text}`);
      }
    }
  }

  return allMessages;
}

app.message(async ({ message, client, say }) => {
  const msg = message as any;

  if (msg.channel_type === 'im' && msg.text) {
    console.log(`[📩] DM from ${msg.user}: ${msg.text}`);

    try {
      const history = await fetchRecentMessages(client, 10);
      const context = history.join('\n');

      const prompt = `
				다음은 슬랙 워크스페이스에서 최근에 오간 대화 내용입니다. 이를 참고해서 아래 질문에 답변해 주세요.

				슬랙 대화:
				${context}

				질문:
				${msg.text}
				`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000
      });

      let reply = '';
      const block = response.content.find(b => b.type === 'text');
      if (block) {
        reply = block.text;
      } else {
        reply = '[⚠️] 클로드가 적절한 답변을 생성하지 못했습니다.';
      }

      console.log(`[🤖 Claude 답변]:\n${reply}`);

      await client.chat.postMessage({
        channel: msg.user,
        text: reply,
      });

    } catch (err) {
      console.error('Error:', err);
      await say('죄송합니다. 처리 중 오류가 발생했습니다.');
    }
  }
});

(async () => {
  await app.start();
  console.log(`⚡️ Slack Claude bot is running!`);
})();
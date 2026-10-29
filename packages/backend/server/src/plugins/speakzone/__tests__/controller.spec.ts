import ava, { TestFn } from 'ava';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { SpeakzoneModule } from '../index';

const test = ava as TestFn<{ app: TestingApp }>;
const TOKEN = 'test-handover-token';
const body = { email: 'nobody@x.y', newEmail: 'nobody-deleted-1@x.y' };

test.before(async t => {
  process.env.SPEAKZONE_HANDOVER_TOKEN = TOKEN;
  t.context.app = await createTestingApp({ imports: [SpeakzoneModule] });
});

test.after.always(async t => {
  delete process.env.SPEAKZONE_HANDOVER_TOKEN;
  await t.context.app.close();
});

test('without the token the endpoint does not exist', async t => {
  const { app } = t.context;
  await app.POST('/api/speakzone/close-account').send(body).expect(404);
  await app
    .POST('/api/speakzone/close-account')
    .set('authorization', 'Bearer wrong')
    .send(body)
    .expect(404);
  t.pass();
});

test('with the token it validates input and answers', async t => {
  const { app } = t.context;
  const auth = { authorization: `Bearer ${TOKEN}` };
  await app
    .POST('/api/speakzone/close-account')
    .set(auth)
    .send({ email: 'x' })
    .expect(400);
  const res = await app
    .POST('/api/speakzone/close-account')
    .set(auth)
    .send(body)
    .expect(200);
  t.deepEqual(res.body, { found: false, workspaces: [] });
});

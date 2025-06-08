import {format} from 'util';
import tempfile from 'tempfile';
import test from 'ava';
import got from '../';
import {createServer} from './helpers/server';

const socketPath = tempfile('.socket');

let s;

test.before('setup', async () => {
	s = await createServer();

	s.on('/', (req, res) => {
		res.end('ok');
	});

	s.on('/foo', (req, res) => {
		res.writeHead(302, {
			location: '/bar'
		});
		res.end();
	});

	s.on('/bar', (req, res) => {
		res.end('ok');
	});

	await s.listen(socketPath);
});

test('works', async t => {
	const url = format('http://unix:%s:%s', socketPath, '/');
	t.is((await got(url)).body, 'ok');
});

test('protocol-less works', async t => {
	const url = format('unix:%s:%s', socketPath, '/');
	t.is((await got(url)).body, 'ok');
});

test('redirects work', async t => {
	const url = format('http://unix:%s:%s', socketPath, '/foo');
	t.is((await got(url)).body, 'ok');
});

test.after('cleanup', async () => {
	await s.close();
});

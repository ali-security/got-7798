import test from 'ava';
import pem from 'pem';
import pify from 'pify';
import got from '../';
import {createServer, createSSLServer} from './helpers/server';

let http;
let https;

const pemP = pify(pem, Promise);

test.before('setup', async () => {
	const caKeys = await pemP.createCertificate({
		days: 1,
		selfSigned: true
	});

	const caRootKey = caKeys.serviceKey;
	const caRootCert = caKeys.certificate;

	const keys = await pemP.createCertificate({
		serviceCertificate: caRootCert,
		serviceKey: caRootKey,
		serial: Date.now(),
		days: 500,
		country: '',
		state: '',
		locality: '',
		organization: '',
		organizationUnit: '',
		commonName: 'sindresorhus.com'
	});

	const key = keys.clientKey;
	const cert = keys.certificate;

	https = await createSSLServer({key, cert}); // eslint-disable-line object-property-newline

	https.on('/', (req, res) => {
		res.end('https');
	});

	http = await createServer();

	http.on('/', (req, res) => {
		res.end('reached');
	});

	http.on('/finite', (req, res) => {
		res.writeHead(302, {
			location: `${http.url}/`
		});
		res.end();
	});

	http.on('/utf8-url-áé', (req, res) => {
		res.end('reached');
	});

	http.on('/redirect-with-utf8-binary', (req, res) => {
		res.writeHead(302, {
			location: new Buffer(`${http.url}/utf8-url-áé`, 'utf8').toString('binary')
		});
		res.end();
	});

	http.on('/endless', (req, res) => {
		res.writeHead(302, {
			location: `${http.url}/endless`
		});
		res.end();
	});

	http.on('/relative', (req, res) => {
		res.writeHead(302, {
			location: '/'
		});
		res.end();
	});

	http.on('/relativeQuery?bang', (req, res) => {
		res.writeHead(302, {
			location: '/'
		});
		res.end();
	});

	http.on('/httpToHttps', (req, res) => {
		res.writeHead(302, {
			location: https.url
		});
		res.end();
	});

	http.on('/protocol', (req, res) => {
		res.writeHead(302, {
			location: 'unix:/var/run/docker.sock:/containers/json'
		});
		res.end();
	});

	http.on('/hostname', (req, res) => {
		res.writeHead(302, {
			location: 'http://unix:/var/run/docker.sock:/containers/json'
		});
		res.end();
	});

	await http.listen(http.port);
	await https.listen(https.port);
});

test('cannot redirect to unix protocol', async t => {
	try {
		await got(`${http.url}/protocol`);
		t.fail('Exception was not thrown');
	} catch (err) {
		t.is(err.message, 'Cannot redirect to UNIX socket');
	}
});

test('cannot redirect to unix protocol2', async t => {
	try {
		await got(`${http.url}/hostname`);
		t.fail('Exception was not thrown');
	} catch (err) {
		t.is(err.message, 'Cannot redirect to UNIX socket');
	}
});

test('follows redirect', async t => {
	t.is((await got(`${http.url}/finite`)).body, 'reached');
});

test('does not follow redirect when disabled', async t => {
	t.is((await got(`${http.url}/finite`, {followRedirect: false})).statusCode, 302);
});

test('relative redirect works', async t => {
	t.is((await got(`${http.url}/relative`)).body, 'reached');
});

test('throws on endless redirect', async t => {
	try {
		await got(`${http.url}/endless`);
		t.fail('Exception was not thrown');
	} catch (err) {
		t.is(err.message, 'Redirected 10 times. Aborting.');
	}
});

test('query in options are not breaking redirects', async t => {
	t.is((await got(`${http.url}/relativeQuery`, {query: 'bang'})).body, 'reached');
});

test('hostname+path in options are not breaking redirects', async t => {
	t.is((await got(`${http.url}/relative`, {
		hostname: http.host,
		path: '/relative'
	})).body, 'reached');
});

test('redirect only GET and HEAD requests', async t => {
	try {
		await got(`${http.url}/relative`, {body: 'wow'});
		t.fail('Exception was not thrown');
	} catch (err) {
		t.is(err.message, 'Response code 302 (Found)');
		t.is(err.path, '/relative');
		t.is(err.statusCode, 302);
	}
});

test('redirects from http to https works', async t => {
	t.truthy((await got(`${http.url}/httpToHttps`, {rejectUnauthorized: false})).body);
});

test('redirects works with lowercase method', async t => {
	const body = (await got(`${http.url}/relative`, {method: 'head'})).body;
	t.is(body, '');
});

test('redirect response contains new url', async t => {
	const url = (await got(`${http.url}/finite`)).url;
	t.is(url, `${http.url}/`);
});

test('redirect response contains old url', async t => {
	const requestUrl = (await got(`${http.url}/finite`)).requestUrl;
	t.is(requestUrl, `${http.url}/finite`);
});

test('redirect response contains utf8 with binary encoding', async t => {
	t.is((await got(`${http.url}/redirect-with-utf8-binary`)).body, 'reached');
});

test.after('cleanup', async () => {
	await http.close();
	await https.close();
});

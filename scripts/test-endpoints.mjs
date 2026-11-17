import http from 'node:http';
import { spawn } from 'node:child_process';

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { ...options, headers: { ...options.headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchUrl(url);
      if (res.statusCode) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function runTests() {
  console.log('🚀 Starting Next.js server for testing...');
  const devProc = spawn('npm.cmd', ['run', 'dev'], {
    shell: true,
    cwd: 'd:\\Project\\Inventory Dashboard\\electrical-contractor-erp',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  devProc.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('Ready in') || line.includes('Local:')) {
      console.log(`[Next.js] ${line}`);
    }
  });

  devProc.stderr.on('data', (d) => {
    // console.error(`[Next.js Error] ${d.toString()}`);
  });

  try {
    console.log('⏳ Waiting for http://127.0.0.1:3000 to become responsive...');
    await waitForServer('http://127.0.0.1:3000', 30000);
    console.log('✅ Server is ready! Beginning automated endpoint test suite...\n');

    const testRoutes = [
      {
        path: '/',
        expectedStatus: [200, 307, 308, 302],
        description: 'Root page (redirect to /login or /dashboard)',
      },
      {
        path: '/login',
        expectedStatus: [200],
        description: 'Login & Signup screen',
        checkBody: (body) => {
          const hasBrand = body.includes('VoltDesk');
          const hasEmailInput = body.includes('type="email"') || body.includes('email');
          const hasGoogleAuth = body.includes('Google') || body.includes('google');
          return hasBrand && hasEmailInput && hasGoogleAuth;
        },
      },
      {
        path: '/dashboard',
        expectedStatus: [200, 307, 308, 302],
        description: 'Main Dashboard (protected route: redirects to /login if unauthenticated)',
      },
      {
        path: '/dashboard/inventory',
        expectedStatus: [200, 307, 308, 302],
        description: 'Inventory Products Catalogue (protected)',
      },
      {
        path: '/dashboard/inventory/new',
        expectedStatus: [200, 307, 308, 302],
        description: 'Add Product Catalogue & Opening Stock Form (protected)',
      },
      {
        path: '/dashboard/inventory/purchases',
        expectedStatus: [200, 307, 308, 302],
        description: 'Purchase Orders Ledger (protected)',
      },
      {
        path: '/dashboard/inventory/purchases/new',
        expectedStatus: [200, 307, 308, 302],
        description: 'Record Multi-Product Purchase Form with WAC preview (protected)',
      },
      {
        path: '/dashboard/inventory/categories',
        expectedStatus: [200, 307, 308, 302],
        description: 'Categories Directory (protected)',
      },
      {
        path: '/dashboard/inventory/suppliers',
        expectedStatus: [200, 307, 308, 302],
        description: 'Suppliers Directory (protected)',
      },
      {
        path: '/dashboard/projects',
        expectedStatus: [200, 307, 308, 302],
        description: 'Projects & Work Orders List (protected)',
      },
      {
        path: '/dashboard/customers',
        expectedStatus: [200, 307, 308, 302],
        description: 'Customers Directory (protected)',
      },
      {
        path: '/auth/reset-password',
        expectedStatus: [200, 307, 308, 302],
        description: 'Reset Password Form (protected / auth flow)',
      },
    ];

    let passedCount = 0;
    let failedCount = 0;

    for (const t of testRoutes) {
      try {
        const res = await fetchUrl(`http://127.0.0.1:3000${t.path}`, {
          // Do not follow redirects automatically so we can verify middleware 307 redirect
        });

        const statusMatch = t.expectedStatus.includes(res.statusCode);
        const bodyOk = t.checkBody ? t.checkBody(res.body) : true;

        if (statusMatch && bodyOk) {
          console.log(`✅ PASS: ${t.path} -> HTTP ${res.statusCode} [${t.description}]`);
          if (res.headers.location) {
            console.log(`   ↳ Redirect location: ${res.headers.location}`);
          }
          passedCount++;
        } else {
          console.error(
            `❌ FAIL: ${t.path} -> HTTP ${res.statusCode} (expected ${t.expectedStatus.join('/')})`
          );
          if (!bodyOk) {
            console.error('   ↳ Body content assertion failed');
          }
          failedCount++;
        }
      } catch (err) {
        console.error(`❌ ERROR: ${t.path} -> ${err.message}`);
        failedCount++;
      }
    }

    console.log(`\n========================================`);
    console.log(`🏁 Test Summary: ${passedCount} PASSED, ${failedCount} FAILED out of ${testRoutes.length} routes`);
    console.log(`========================================\n`);

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    console.log('🛑 Stopping test server process...');
    devProc.kill('SIGTERM');
  }
}

runTests();

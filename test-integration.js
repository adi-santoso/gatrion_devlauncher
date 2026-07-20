/**
 * Integration Test Helper
 * Run this in the browser console to test IPC integration
 */

// Check if Electron is available
console.log('Electron available:', window.electron !== undefined);

// If in Electron, test IPC calls
if (window.electron) {
  console.log('Running Electron IPC tests...');

  // Test 1: Get projects
  window.electron.getProjects().then(result => {
    console.log('✓ getProjects:', result);
  });

  // Test 2: Get config
  window.electron.getConfig().then(result => {
    console.log('✓ getConfig:', result);
  });

  // Test 3: Test event listener
  window.electron.onProcessStatus((projectId, status) => {
    console.log('✓ onProcessStatus event:', projectId, status);
  });

  console.log('IPC tests initiated. Check console for results.');
} else {
  console.log('Running in browser mode with mock data');
}

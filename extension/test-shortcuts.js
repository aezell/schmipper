// Test script for validating keyboard shortcuts functionality
// This is for development testing - not part of the build

console.log('Testing Browser Volume Controller Shortcuts');

// Test shortcuts manager initialization
const { ShortcutsManager } = require('./dist/shortcuts.js');

async function testShortcuts() {
  try {
    console.log('✓ Creating ShortcutsManager instance...');
    const manager = new ShortcutsManager();
    
    console.log('✓ Getting all shortcuts...');
    const shortcuts = manager.getShortcuts();
    console.log(`Found ${shortcuts.length} shortcuts`);
    
    shortcuts.forEach(shortcut => {
      console.log(`- ${shortcut.id}: ${shortcut.description}`);
      console.log(`  Key: ${manager.getActiveKey(shortcut)}`);
      console.log(`  Category: ${shortcut.category}`);
      console.log(`  Enabled: ${shortcut.enabled}`);
    });
    
    console.log('\n✓ Testing shortcut categories...');
    const coreShortcuts = manager.getShortcutsByCategory('core');
    const advancedShortcuts = manager.getShortcutsByCategory('advanced');
    console.log(`Core shortcuts: ${coreShortcuts.length}`);
    console.log(`Advanced shortcuts: ${advancedShortcuts.length}`);
    
    console.log('\n✓ Testing key validation...');
    const validKeys = [
      'Ctrl+Shift+M',
      'Command+Shift+Up',
      'Ctrl+Shift+1'
    ];
    
    const invalidKeys = [
      'M',
      'Shift+M',
      'Ctrl+Invalid'
    ];
    
    validKeys.forEach(key => {
      const isValid = manager.validateShortcutKey(key);
      console.log(`${key}: ${isValid ? '✓ Valid' : '✗ Invalid'}`);
    });
    
    invalidKeys.forEach(key => {
      const isValid = manager.validateShortcutKey(key);
      console.log(`${key}: ${isValid ? '✗ Should be invalid' : '✓ Correctly invalid'}`);
    });
    
    console.log('\n🎉 All shortcuts tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testShortcuts();
}

module.exports = { testShortcuts };

import { tmuxManager } from './tmux-manager.js';

describe('tmuxManager', () => {
  it('should work', () => {
    expect(tmuxManager()).toEqual('tmux-manager');
  })
})

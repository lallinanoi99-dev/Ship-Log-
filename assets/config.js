// The one place to set contract addresses, the Worker URL and links.
// Leave `contract` empty to run in preview mode (a local, simulated contract saved in this browser).
export const CONFIG = {
  networks: {
    mainnet: {
      chainId: 677,
      name: 'BOT Chain',
      rpc: 'https://rpc.botchain.ai',
      explorer: 'https://scan.botchain.ai',
      contract: '0x0a8c0369949DEd5068C83Fa9ebfe7221508839d9', // ShipLog on BOT Chain mainnet (also in README + footer)
    },
    testnet: {
      chainId: 968,
      name: 'BOT Chain Testnet',
      rpc: 'https://rpc.bohr.life',
      explorer: 'https://scan.bohr.life',
      contract: '', // ← testnet address (used with ?net=testnet)
    },
  },
  // Shared Week 1 Cloudflare Worker: POST /ship/post, /ship/recap. Empty → posts use a simple template.
  worker: '',
  links: {
    botchain: 'https://botchain.ai',
    github: 'https://github.com/lallinanoi99-dev/Ship-Log-',
    x: 'https://x.com/',
    // Where "Report" goes (curators review and hide spam from Explore). A mailto: or GitHub issues URL.
    report: 'https://github.com/lallinanoi99-dev/Ship-Log-',
  },
  storageKey: 'shiplog',
};

import twitterStrategy from './twitter.strategy.js';
import facebookStrategy from './facebook.strategy.js';
import linkedinStrategy from './linkedin.strategy.js';

const strategies = {
  twitter: twitterStrategy,
  facebook: facebookStrategy,
  linkedin: linkedinStrategy
};

function getPlatformStrategy(platform) {
  return strategies[platform];
}

export default getPlatformStrategy;
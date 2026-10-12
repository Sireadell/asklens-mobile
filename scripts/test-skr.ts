// @ts-nocheck
import { getGuardTier } from '../src/solana/skr';
(async()=>{
for (const a of ['3Yh1ysLEnhwYM1tJk1XWX8vKTPVQzEbeGgeJwiuM4wF7','77777nPhGvFUVAj6uq8MGyLneBt4SMwCScYZDzzztdsa','9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'])
  console.log(a.slice(0,6), JSON.stringify(await getGuardTier(a)));
})();

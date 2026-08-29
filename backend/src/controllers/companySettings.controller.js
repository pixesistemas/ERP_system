const repo = require("../repositories/companySettings.repository");
function get(req,res,next){ try { res.json({ok:true,settings:repo.getSettings(req.empresa.id)}); } catch(e){next(e)} }
function save(req,res,next){ try { res.json({ok:true,settings:repo.saveSettings(req.empresa.id,req.body||{})}); } catch(e){next(e)} }
module.exports={get,save};

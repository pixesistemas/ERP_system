const router=require("express").Router();
const controller=require("../controllers/companySettings.controller");
router.get("/",controller.get);
router.put("/",controller.save);
module.exports=router;

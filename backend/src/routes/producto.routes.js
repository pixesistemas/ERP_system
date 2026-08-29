const router = require('express').Router();
const controller = require('../controllers/producto.controller');
router.get('/', controller.list);
router.post('/importar', controller.importar);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
module.exports = router;

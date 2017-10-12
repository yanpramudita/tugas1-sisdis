const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema({
	user_id: String,
	nama: String,
	nilai_saldo: Number
});

module.exports = mongoose.model('User', RequestSchema);

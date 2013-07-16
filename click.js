var fs = require('fs');
var REQUEST = require('request');
var nconf = require('nconf');
nconf.file('config.json');
nconf.load();
var j = REQUEST.jar();
req = REQUEST.defaults({strictSSL:false/*, 'proxy':'http://localhost:8080'*/ , jar:j, headers:{'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:20.0) Gecko/20100101 Firefox/20.0'}});
var cheerio = require('cheerio');
var winston = require('winston');
winston.remove(winston.transports.Console);
//winston.add(winston.transports.Console, {'timestamp':true, level: 'info'});
winston.add(winston.transports.File, {
    'timestamp':true, 
    level: 'info',
    filename: 'click.log',
    timestamp:'true',
    maxsize: 1048576,
    maxFiles: 2
});
var nodemailer = require("nodemailer");
var smtp = nodemailer.createTransport("SMTP", {
	service: nconf.get("mail:from:service"), auth: { 
		user: nconf.get("mail:from:user"),
		pass: nconf.get("mail:from:pass")
	}
});

winston.warn("app started");
smtp.sendMail({
	from: nconf.get("mail:from:user"),
	to: nconf.get("mail:to:user"),
	subject: "app started.",
	text: "Start watching your balance."
});

var total = total || 0;
function restart(error){
	if(error){
		winston.error(error);
	}
	winston.info('making logout');
	setTimeout(function(){
		req('https://click.alfabank.ru/oam/server/logout?end_url=https://click.alfababnk.ru/ALFAIBSR', function(error, res, body){
		setTimeout(function(){req('https://click.alfabank.ru/oam_logout_success', function(error, res, body){	
			if(error) winston.error(error);
			winston.info('made logout');
			loggin();
		})},2000);
	})}, 10*60*1000);
}
function loggin(){
	j.cookies.splice(0,j.cookies.length);
	req.get({uri:'https://click.alfabank.ru/ALFAIBSR/',followAllRedirects: true}, function(error,res, body){
		req({method: 'POST', uri: 'https://click.alfabank.ru/oam/server/auth_cred_submit',followAllRedirects: 'true', form:{username:nconf.get("click:login"),password:nconf.get("click:password")}}, function(error, res, body){
			if(error) winston.log(error);
			var reg = /_afrLoop=(\d+)/i.exec(body);
			if(!reg) {
				restart('afr is null '+body);
				return;
			}	
			var afr = reg[1];
			j.cookies.splice(1,1);
			winston.info("afr: '"+afr+"'");
			req('https://click.alfabank.ru/ALFAIBSR/?_afrLoop='+afr+'&_afrWindowMode=0&_afrWindowId=null', function(error, res, body){
				req('https://click.alfabank.ru/ALFAIBSR/faces/adf.task-flow?_id=init&_document=/alfabank/c/flows/init.xml', function(error, res, body){
					var afr = /_afrLoop=(\d+)/i.exec(body)[1];
					winston.info("afr: '"+afr+"'");

					req('https://click.alfabank.ru/ALFAIBSR/faces/adf.task-flow?_id=init&_document=/alfabank/c/flows/init.xml&_afrLoop='+afr+'&_afrWindowMode=0&_afrWindowId=',function(error, res, body){
						var $ = cheerio.load(body);
						total = $("div[id='pt1:r4:0:t3:pgl10'] div:nth-child(2)").text().replace(' ', '')||total;
						winston.info('total: '+total);

						var reg_ctrl = /_adf.ctrl-state=([a-z_A-Z\d]+)/i.exec(body);
						if(!reg_ctrl) { restart('adf_ctrl is null)'+body); return;}
						var adf_ctrl = reg_ctrl[1];
						winston.info("adf_ctrl='"+adf_ctrl+"'");
						var windowId = /window.name='(.+?)'/.exec(body)[1];
						var viewState = /name="javax.faces.ViewState" value="(.+?)"/.exec(body)[1];
						winston.info("viewState='"+viewState+"'");
						winston.info("windowId='"+windowId+"'"); 
						req('https://click.alfabank.ru/ALFAIBSR/faces/adf.task-flow?_afrWindowId='+windowId+'&_afrLoop='+afr+'&_document=%2Falfabank%2Fc%2Fflows%2Finit.xml&_id=init&_afrWindowMode=0&_adf.ctrl-state='+adf_ctrl, function(error, res, body){
							afr = /_afrLoop=(\d+)/i.exec(body)[1];
							winston.info("afr: '"+afr+"'");
							var i = 0;
							winston.profile('full cycle');

							function mainer(){
								req({method: 'POST', uri: 'https://click.alfabank.ru/ALFAIBSR/faces/main/mainPage?_adf.ctrl-state='+adf_ctrl, form:{'org.apache.myfaces.trinidad.faces.FORM': 'f1', event: 'pt1:header:i1', 'event.pt1:header:i1':'<m xmlns="http://oracle.com/richClient/comm"><k v="type"><s>action</s></k></m>', 'javax.faces.ViewState': viewState,'oracle.adf.view.rich.PPR_FORCED':'true'}}, function(error, res, body){
									winston.profile('parsing');								
									var $ = cheerio.load(body);
									var total2 = $("div[id='pt1:r4:0:t3:pgl10'] div:nth-child(2)").text().replace(' ','');
									winston.profile('parsing');
									if(!total2){
										restart("total2 is null. "+body);
										return;
									}

									winston.info('count: '+ i +' total: '+total2);
									if(total2!==total){
										var delta = parseFloat(total2)-parseFloat(total);
										winston.info('С вашего счета списано '+delta);
										smtp.sendMail({
											from: nconf.get("mail:from:user"),
											to:nconf.get("mail:to:user"),
											subject: "С вашего счета списано "+delta,
											text: "Общая сумма на вашем счету "+total2
										});

										total = total2;
									}
									i+=1;
									vs = /name="javax.faces.ViewState" value="(.+?)"/.exec(body);
									if(!vs) {
										restart("ViewState is null "+body);
										return;
									}
									viewState = vs[1];
									winston.profile('full cycle');		
									//mainer();
									mainer();
								});
							}
							mainer();
						});
					});
				});
			});
		});
	});
}
loggin();

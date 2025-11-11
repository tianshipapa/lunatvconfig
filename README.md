# lunatvconfig
lunatvconfig page版
可以中转lunatv的配置代理
首先鸣谢 https://github.com/hafrey1/LunaTV-config
提供的cfworker代码。

下面提供的是cfpage版。是由

CFPAGE部署方法

方法一：
1.fork本项目
2.打开cfPages → 你的项目 → 设置 → 变量和机密 → 添加
变量名（大写U）: U
值可以设置成lunatv配置地址，默认的是https://github.com/hafrey1/LunaTV-config中的jinjian.json等3个地址，可以选择。
保存后自动重新部署即可。
以后想换地址，直接改控制台里的 U，无需重新 push 代码。

方法二：下载_worker.js,压缩为zip，上传pages部署

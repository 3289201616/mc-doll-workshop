# MC 玩偶工坊 · MC Doll Workshop

导入一张 Minecraft 皮肤，自动生成 Q 版玩偶模型：实时 3D 预览，一键导出 **GLB / glTF / FBX / OBJ**。

纯前端、无后端，皮肤只在浏览器里处理。

## 功能

- **皮肤导入**：拖入 PNG / JPG / WebP。支持 64×64（1.8+）、64×32（1.7 及更早）、以及 2×/4× 的 HD 皮肤。
- **老皮肤自动补全**：64×32 只画了右臂右腿，按官方 1.8 转换规则镜像出左边，不会缺胳膊少腿。
- **两套体型**：细胳膊（Alex，3 像素手臂）/ 经典（Steve，4 像素）。选错不会崩，只是手臂贴图会裁一条边。
- **自定义骨骼**：可以导入自己的 Bedrock `geo.json`，走同一套解析管线。
- **原版观感**：面明暗（顶亮、底暗、侧面中）烘进顶点色，不依赖灯光，导到任何查看器都是一个样。
- **四种导出**：GLB 单文件贴图内嵌；glTF 打成 zip（json + bin + png）；FBX 二进制贴图内嵌；OBJ 附自写 mtl 和贴图。
- **预览图**：一键存 1400×1400 的定妆照，背景跟着当前主题走。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5180/`。

## 构建与发布

```bash
npm run build
```

产物在 `dist/`，资源路径全部相对（`base: './'`），入口 `index.html` 约 20 KB。

用 B站官方 Toy CLI 发布：

```powershell
.\.toy-bin\toy.exe login

# 先出预览，不提交
.\.toy-bin\toy.exe create dist --title "MC 玩偶工坊" --slug mc-doll-workshop --category TOOL `
  --poster publish/poster.png --icon publish/icon.png --theme light --visibility public --json

# 看过预览再加 --yes 提交审核
```

内容预检：

```bash
python .toy-skill/toy_doctor.py dist --json
```

## 目录

```
index.html              页面结构
src/main.js             交互、皮肤导入、导出编排
src/geometry.js         Bedrock 几何 → three 网格（核心）
src/skin.js             皮肤读取、尺寸校验、老皮肤升级
src/stage.js            three 舞台、机位、截图
src/exporters.js        GLB / glTF / FBX / OBJ 导出
src/styles.css          样式
src/geo/alex.json       细胳膊骨骼（来自《森罗物语：玩偶工坊》）
src/geo/steve.json      经典体型骨骼
public/samples/         默认示例皮肤
tools/                  开发期的截图与验收脚本
publish/                封面与图标
```

## 几个踩过的坑

**坐标系手性**。Bedrock 的几何数据搬到 three 里，绕 X、Z 的旋转角要取反、绕 Y 的保持原样。照抄角度会让胳膊直接甩进身体里——源文件里右臂的枢轴点本身也不太靠得住，取反之后两只胳膊才正好镜像对上。

**逐面 UV 的朝向**。1.12 格式的每个面都有自己的 `uv` / `uv_size`，`uv_size` 可以为负（表示朝反方向展开），还能叠一个 `uv_rotation`。这里的 `(u, v)` 是「从外面看这个面」的左上角，所以每个面的顶点排列都不一样，写错一个面就是镜像或者上下颠倒。

**绕序不要手写**。六个面的顶点顺序很容易记反，所以生成三角形时用叉积和期望法线比一次，反了就翻——比逐个核对顶点顺序可靠。

**第二层越界**。皮肤比模型声明的贴图小的时候（64×32），落在画布外的方块要直接隐藏，否则会采样到透明像素变成黑块。

**预览要和导出一致**。预览关掉了色调映射（ACES 会把纯色块压灰），否则页面上看到的和拖进 Blender 看到的不是一个颜色。

**FBX 的贴图偏软**。FBX 不存纹理过滤方式，某些软件里会用线性过滤把 8×8 的贴图糊开。在 Blender 里把纹理插值改成「最近」就恢复像素感了——模型和 UV 本身是对的。

## 备注

- 皮肤不上传，全部在本地 canvas 里处理。
- 导出尺寸与游戏内一致：1 单位 = 1 格，玩偶约 0.88 格高（14 像素）。
- OBJ 不支持顶点色，原版那种面明暗会丢，需要重新打光。
- 关掉「第二层」后导出里也不带，所见即所得。

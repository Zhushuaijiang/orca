---
name: dfhis-yibao-dmdz
description: DFHIS 新医院医保目录对照初始化。用于根据已维护的国家医保编码（gy_shoufeixm.guojiaxmdm / gy_yaopinmccd.guojiaypbm），批量生成 yb_zhenliaodmdz（诊疗对照）和 yb_yaopindmdz（药品对照）的 INSERT 语句。当需要为新医院初始化医保对照数据、医保对码、目录对照时使用。
---

# DFHIS 新医院医保目录对照初始化

## 适用场景

新医院上线或医保接口接入时，需要将 HIS 收费项目（诊疗）和药品库中**已维护国家医保编码**的记录，批量写入医保目录对照表，完成"已对照未提交"的初始化。

## 涉及表

| 角色 | Schema.表名 | 说明 |
| --- | --- | --- |
| 源-诊疗 | `df_zhushuju.gy_shoufeixm` | 收费项目主表，关键字段 `guojiaxmdm`（国家项目代码）、`shoufeixmid`（主键） |
| 源-药品 | `df_yaokufang.gy_yaopinmccd` | 药品明码字典，关键字段 `guojiaypbm`（国家医保药品编码）、`jiageid`（主键） |
| 目标-诊疗 | `df_yibao.yb_zhenliaodmdz` | 医保诊疗目录对照（36 列） |
| 目标-药品 | `df_yibao.yb_yaopindmdz` | 医保药品目录对照（45 列） |
| 关联-剂型 | `df_yaokufang.gy_jixing` | 药品剂型字典（`jixingid` → `jixingmc`） |

## 核心字段映射

### 诊疗对照 gy_shoufeixm → yb_zhenliaodmdz

| 目标字段 | 来源 | 说明 |
| --- | --- | --- |
| `yiliaobxid` | 固定值（如 `'105'`） | 医保保险ID，按新医院实际填 |
| `yibaozcbh` | 固定值 `1` | 医保注册编号 |
| `yiyuanylxh` | `s.shoufeixmid` | 医院诊疗序号 |
| `renyuanlbdm` | `'*'` | 人员类别，默认全部 |
| `yibaozldm` | `s.guojiaxmdm` | 医保诊疗代码 |
| `yiyuandzdm` | `'0\|' \|\| shoufeixmid \|\| '\|' \|\| shoufeixmid` | 格式 `0|中间码|医院序号` |
| `yiyuanzlmc` | `s.shoufeixmmc` | 医院诊疗名称 |
| `duizhaofs` | `'1'` | 对照方式，1=手工对照 |
| `yibaoshjg` | `4` | 审核结果，4=已对照未提交 |
| `zidianjlxh` | `gen_random_uuid()::varchar` | 唯一主键，无业务含义 |
| `guojiabm` | `s.guojiaxmdm` | 国家编码 |
| `shuruma` | `s.shuruma1` | 输入码 |
| `shengma` | `split_part(guojiaxmdm, '-', 2)` | 省码，取 `-` 后半部分 |
| `shangchuanrq` / `shangchuanren` | `NULL` | 未上传 |
| `chuangjianren` / `chuangjianrenxm` | `'DBA'` | 创建人 |

### 药品对照 gy_yaopinmccd → yb_yaopindmdz

| 目标字段 | 来源 | 说明 |
| --- | --- | --- |
| `yiliaobxid` | 固定值（如 `'105'`） | 医保保险ID |
| `yibaozcbh` | 固定值 `1` | 医保注册编号 |
| `yiyuanypxh` | `y.jiageid` | 医院药品序号 |
| `yaopincddm` | `y.chandi` | 药品产地代码 |
| `yibaoypdm` | `y.guojiaypbm` | 医保药品代码 |
| `yiyuandzdm` | `'0\|' \|\| jiageid \|\| '\|' \|\| jiageid` | 格式 `0|中间码|医院序号` |
| `yiyuanypmc` | `y.yaopinmc` | 医院药品名称 |
| `yiyuanypgg` | `y.yaopingg` | 医院药品规格 |
| `yiyuanypcdmc` | `y.chandimc` | 医院药品产地名称 |
| `yiyuanypdw` | `y.baozhuangdw` | 包装单位 |
| `yiyuanyplx` | `y.yaopinlx::double precision` | 药品类型（需数字转换） |
| `yiyuanjxmc` | 子查询 `gy_jixing.jixingmc` | 剂型名称 |
| `yiyuanjxid` | `y.jixing` | 剂型ID |
| `yiyuanypggid` | `y.guigeid` | 规格ID |
| `yiyuanypdggid` | `y.daguigeid` | 大规格ID |
| `yiyuanhzsrm1` | `y.shuruma1` | 输入码 |
| `yibaoshjg` | `4` | 审核结果，4=已对照未提交 |
| `zhenliaoyppb` | `1` | 诊疗药品排别 |
| `zidianjlxh` | `gen_random_uuid()::varchar` | 唯一主键 |
| `guojiabm` | `y.guojiaypbm` | 国家编码 |
| `yaopinzhbl` | `y.baozhuangliang` | 包装数量 |
| `shangchuanrq` / `shangchuanren` | `NULL` | 未上传 |
| `chuangjianren` / `chuangjianrenxm` | `'DBA'` | 创建人 |

## 使用前需确认的参数

模板已内置常用默认值，多数新医院无需修改即可直接执行。如需调整：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `yiliaobxid` | `'105'` | 国家医保（多数医院用此值；商保/地方医保另查 `yb_yibaobxxz`） |
| `yibaozcbh` | `1` | 医保注册编号 |
| `yuanquid` | `'1'` | 第一个院区（多院区按实际填写） |
| `tenantid` | `'0'` | 租户ID |
| `chuangjianren` / `chuangjianrenxm` | `'DBA'` | 创建人 |

> **注意**：如修改 `yiliaobxid`，两条 INSERT 的 SELECT 值和各自 NOT EXISTS 子查询中的 `yiliaobxid` 需同步修改（共 4 处）。

## 关键业务规则

1. **只插入国家编码已维护的记录**：`guojiaxmdm`/`guojiaypbm` IS NOT NULL AND <> ''
2. **跳过已作废记录**：`zuofeibz = 0`
3. **防重复插入**：NOT EXISTS 子查询按 `yiyuanylxh`/`yiyuanypxh` + `yiliaobxid` + `tenantid` 判断
4. **`yibaoshjg = 4`**：表示"已对照未提交"，后续在医保模块中上传提交后状态变更
5. **`zidianjlxh = gen_random_uuid()`**：唯一主键，无业务含义
6. **`shangchuanrq`/`shangchuanren` 为 NULL**：未上传到医保平台，上传后回填

## 执行步骤

1. 确认新医院 `gy_shoufeixm.guojiaxmdm` 和 `gy_yaopinmccd.guojiaypbm` 已维护
2. 确认 `yiliaobxid`（默认 `105`=国家医保）和 `yuanquid`（默认 `1`=第一个院区）；如有多个医保或院区，按需替换
3. 在目标医院数据库执行 `templates/yibao-dmdz-init.sql`（建议先在事务中运行，确认行数后 COMMIT）
4. 执行末尾验证 SQL 确认插入数量

## 数据库环境

目标数据库为 PostgreSQL（DFHIS 标准库），需支持 `gen_random_uuid()` 函数（pgcrypto 扩展）。如目标库未启用该扩展，先执行：

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

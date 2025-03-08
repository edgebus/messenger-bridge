--[[

https://www.howtocreate.co.uk/tutorials/jsexamples/syntax/prepareInline.html

Получить есклюзивную блокировку над иденификатором `<WF_APP_UUID>` приложения `Workflow App`.
Для этого LUA процедура делат следующее:
	* Выбрать список активных `Workflow App` `workflow:processing:<RUNNER_VERSION>`
	* Перебирая полученный список (!!!с головы!!!):
		* Если `<WF_APP_UUID>` выполняется в текущий момент `workflow:lock:<WF_APP_UUID>`, переходим к следующему элементу списка (continue;)
		* Если `<WF_APP_UUID>` находятся в брекоинте `workflow:breakpoint:wait:<WF_APP_UUID>`, переходим к следующему элементу списка (continue;)
		* Блокируем запись, в `workflow:lock:<WF_APP_UUID>`
		* Перемещаем запись `<WF_APP_UUID>` в конец(хвост) списка `workflow:processing:<RUNNER_VERSION>` путем увеличения значения Score (обеспечиваем цикличность)
		* Возвращаем пользователю заблокированный `<WF_APP_UUID>`
	* Возвращаем пользователю null

== Версионирование ==
Формат RUNNER_VERSION: MAJOR.MINOR (см https://semver.org/)
Версионирование построено на принципе проверки, что раннер может обрабатывать активити версий
ниже-равно чем MAJOR.MINOR.
Другими словами, если в системе появляются более новые версии, они будут обработаны
только на более новый раннерах


* SET  `workflow:tick:<WF_APP_UUID>` `{ ..., "workflowVirtualMachineSnapshot": { ...json... }, nextTickTags: ["tag1","tag2", ...],  ... }` - Результат последнего тика (копия самой свежей записи из Postgress `workflow_tick`)
* ZADD `workflow:processing:<RUNNER_VERSION>` `<WF_APP_UUID>` - хранит сортированный спиcок незавершенных `Workflow App` (копия из Postgress `FROM workflow_tick WHERE crash_report IS NULL AND state_snapshot IS NOT NULL`). Score записи обновляется при блокировании (функция `lockNextWorkflowApplication-4.lua`), что обеспечивает перемещение залоченой записи в хвост списка (перемешивание).
* SET  `workflow:lock:<WF_APP_UUID>` `<WORKFLOW_WORKER_ID>` - хранит строку указывающую на имя-идентификатор сервиса который владеет(залочил) `Workflow App` в текущий момент времени
* SET  `workflow:breakpoint:wait:<WF_APP_UUID>` `<BREAKPOINT_NAME>` - хранит имя брекпоинта в котором сейчас спит `Workflow App`

]]
local runnerVersion = KEYS[1]
local lockInstance = KEYS[2]
local lockTimeout = KEYS[3]
local workerTagsJsonArray = KEYS[4]

local workerTags = cjson.decode(workerTagsJsonArray)

local processingKey = "workflow:processing:" .. runnerVersion

redis.replicate_commands()

local now = redis.call("TIME")
local jstimestamp = now[1] .. string.sub(now[2], 0, 3)
local activesWorkflowApplications = redis.call("ZRANGE", processingKey, 0, -1)
if activesWorkflowApplications == nil then
    return nil
end

for k, processingWorkflowApplicationUuid in pairs(activesWorkflowApplications) do
    local lockKey = "workflow:lock:" .. processingWorkflowApplicationUuid
    -- check: is not lock-ed
    if not redis.call("GET", lockKey) then
        local breakpointKey = "workflow:breakpoint:wait:" .. processingWorkflowApplicationUuid
        -- check: is not breakpoint-ed
        if not redis.call("GET", breakpointKey) then
            local lastTickKey = "workflow:tick:" .. processingWorkflowApplicationUuid
            local lastTickJsonData = redis.call("GET", lastTickKey)
            if not lastTickJsonData then
                -- no last tick data related to processingWorkflowApplicationUuid, so remove this from processing at all
                -- this will restored from Posgtress with tick data
                redis.call("ZREM", processingKey, processingWorkflowApplicationUuid)
            else
                -- do lock
                local lastTickData = cjson.decode(lastTickJsonData)
                -- check: next tick tags
                local allowLockByThisInstance = true
                if lastTickData.nextTickTags then
                    for tagIndex = 1, #lastTickData.nextTickTags do
                        local requiredTag = lastTickData.nextTickTags[tagIndex]
                        local isRequiredTagPresentedInWorkerTags = false
                        for _, workerTag in pairs(workerTags) do
                            if workerTag == requiredTag then
                                isRequiredTagPresentedInWorkerTags = true
                                break
                            end
                        end
                        if not isRequiredTagPresentedInWorkerTags then
                            allowLockByThisInstance = false
                            break
                        end
                    end
                end
                -- is tags allows execution
                if allowLockByThisInstance then
                    -- update scope (move to tail)
                    redis.call("ZADD", processingKey, jstimestamp, processingWorkflowApplicationUuid)
                    -- setup lock key
                    redis.call("SET", lockKey, lockInstance, "EX", lockTimeout)
                    return processingWorkflowApplicationUuid
                end
            end
        end
    end
end

return nil

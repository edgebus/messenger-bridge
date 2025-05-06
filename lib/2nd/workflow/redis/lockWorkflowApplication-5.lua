--[[

Convert this text into JS:

   https://www.howtocreate.co.uk/tutorials/jsexamples/syntax/prepareInline.html

]]
local runnerVersion = KEYS[1]
local lockInstance = KEYS[2]
local lockTimeout = KEYS[3]
local workerTagsJsonArray = KEYS[4]
local processingWorkflowApplicationUuid = KEYS[5]

redis.replicate_commands()

local now = redis.call("TIME")
local jstimestamp = now[1] .. string.sub(now[2], 0, 3)

    local lockKey = "workflow:lock:" .. processingWorkflowApplicationUuid
    -- check: is not lock-ed
    if not redis.call("GET", lockKey) then
        redis.call("SET", lockKey, lockInstance, "EX", lockTimeout)
        return processingWorkflowApplicationUuid
    end

return nil
